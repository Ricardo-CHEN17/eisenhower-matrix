import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import {
  calendarQuerySchema,
  createCalendarSubscriptionSchema,
  createTagSchema,
  createTaskSchema,
  importCalendarSchema,
  isValidCalendarIcs,
  listTasksQuerySchema,
  normalizeCalendarUrl,
  parseCalendarEvents,
  settingsPatchSchema,
  updateTagSchema,
  updateTaskSchema,
  type CalendarEvent,
  type CalendarSubscription
} from "@eisenhower/shared";
import type { AppDb } from "./db/client";
import {
  createTag,
  createTask,
  deleteCalendarSubscription,
  deleteTag,
  deleteTask,
  getCalendarSubscription,
  getSettings,
  getTaskById,
  insertCalendarSubscription,
  listCalendarIcs,
  listCalendarSubscriptions,
  listTags,
  listTasks,
  updateCalendarSubscriptionFetch,
  updateSettings,
  updateTag,
  updateTask
} from "./db/repo";
import { fetchCalendarIcs } from "./calendar";

async function parseJson<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ")
    });
  }
  return parsed.data;
}

function parseQuery<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "query"}: ${issue.message}`)
        .join("; ")
    });
  }
  return parsed.data;
}

export function createApp(db: AppDb) {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/tasks", (c) => {
    const query = parseQuery(listTasksQuerySchema, c.req.query());
    const tagIds = query.tagIds
      ? query.tagIds
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined;
    return c.json(
      listTasks(db, {
        view: query.view,
        q: query.q,
        tagIds
      })
    );
  });

  app.get("/api/tasks/:id", (c) => {
    const task = getTaskById(db, c.req.param("id"));
    if (!task) throw new HTTPException(404, { message: "Task not found" });
    return c.json(task);
  });

  app.post("/api/tasks", async (c) => {
    const input = await parseJson(c, createTaskSchema);
    return c.json(createTask(db, input), 201);
  });

  app.patch("/api/tasks/:id", async (c) => {
    const input = await parseJson(c, updateTaskSchema);
    const task = updateTask(db, c.req.param("id"), input);
    if (!task) throw new HTTPException(404, { message: "Task not found" });
    return c.json(task);
  });

  app.delete("/api/tasks/:id", (c) => {
    const deleted = deleteTask(db, c.req.param("id"));
    if (!deleted) throw new HTTPException(404, { message: "Task not found" });
    return c.json({ ok: true });
  });

  app.get("/api/tags", (c) => c.json(listTags(db)));

  app.post("/api/tags", async (c) => {
    const input = await parseJson(c, createTagSchema);
    try {
      return c.json(createTag(db, input), 201);
    } catch (error) {
      if ((error as { code?: string }).code?.startsWith("SQLITE_CONSTRAINT")) {
        throw new HTTPException(409, { message: "A tag with that name already exists" });
      }
      throw error;
    }
  });

  app.patch("/api/tags/:id", async (c) => {
    const input = await parseJson(c, updateTagSchema);
    try {
      const tag = updateTag(db, c.req.param("id"), input);
      if (!tag) throw new HTTPException(404, { message: "Tag not found" });
      return c.json(tag);
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      if ((error as { code?: string }).code?.startsWith("SQLITE_CONSTRAINT")) {
        throw new HTTPException(409, { message: "A tag with that name already exists" });
      }
      throw error;
    }
  });

  app.delete("/api/tags/:id", (c) => {
    const deleted = deleteTag(db, c.req.param("id"));
    if (!deleted) throw new HTTPException(404, { message: "Tag not found" });
    return c.json({ ok: true });
  });

  app.get("/api/settings", (c) => c.json(getSettings(db)));

  app.patch("/api/settings", async (c) => {
    const input = await parseJson(c, settingsPatchSchema);
    return c.json(updateSettings(db, input));
  });

  async function refreshSubscription(
    subscription: CalendarSubscription
  ): Promise<CalendarSubscription> {
    if (subscription.sourceType !== "url" || !subscription.url) {
      return subscription;
    }

    try {
      const rawIcs = await fetchCalendarIcs(subscription.url);
      return (
        updateCalendarSubscriptionFetch(db, subscription.id, {
          rawIcs,
          lastFetchedAt: new Date().toISOString(),
          lastError: null
        }) ?? subscription
      );
    } catch (error) {
      return (
        updateCalendarSubscriptionFetch(db, subscription.id, {
          lastError:
            error instanceof Error ? error.message : "Could not refresh calendar"
        }) ?? subscription
      );
    }
  }

  app.get("/api/calendar/subscriptions", (c) =>
    c.json(listCalendarSubscriptions(db))
  );

  app.post("/api/calendar/subscriptions", async (c) => {
    const input = await parseJson(c, createCalendarSubscriptionSchema);
    const url = normalizeCalendarUrl(input.url);

    const duplicate = listCalendarSubscriptions(db).find(
      (subscription) => subscription.url === url
    );
    if (duplicate) {
      throw new HTTPException(409, {
        message: "This calendar is already added."
      });
    }

    let rawIcs = "";
    let lastError: string | null = null;
    try {
      rawIcs = await fetchCalendarIcs(url);
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Could not fetch calendar";
    }

    const subscription = insertCalendarSubscription(db, {
      name: input.name,
      color: input.color,
      sourceType: "url",
      url,
      rawIcs,
      lastFetchedAt: rawIcs ? new Date().toISOString() : null,
      lastError
    });

    return c.json(subscription, 201);
  });

  app.post("/api/calendar/import", async (c) => {
    const input = await parseJson(c, importCalendarSchema);
    if (!isValidCalendarIcs(input.ics)) {
      throw new HTTPException(400, {
        message: "This file is not a valid iCalendar (.ics) feed."
      });
    }

    const subscription = insertCalendarSubscription(db, {
      name: input.name,
      color: input.color,
      sourceType: "file",
      rawIcs: input.ics,
      lastFetchedAt: new Date().toISOString(),
      lastError: null
    });

    return c.json(subscription, 201);
  });

  app.post("/api/calendar/subscriptions/:id/refresh", async (c) => {
    const subscription = getCalendarSubscription(db, c.req.param("id"));
    if (!subscription) {
      throw new HTTPException(404, { message: "Calendar not found" });
    }
    if (subscription.sourceType !== "url") {
      throw new HTTPException(400, {
        message: "Uploaded calendars can only be refreshed by uploading them again."
      });
    }
    return c.json(await refreshSubscription(subscription));
  });

  app.post("/api/calendar/refresh", async (c) => {
    const subscriptions = listCalendarSubscriptions(db);
    for (const subscription of subscriptions) {
      await refreshSubscription(subscription);
    }
    return c.json(listCalendarSubscriptions(db));
  });

  app.delete("/api/calendar/subscriptions/:id", (c) => {
    const deleted = deleteCalendarSubscription(db, c.req.param("id"));
    if (!deleted) throw new HTTPException(404, { message: "Calendar not found" });
    return c.json({ ok: true });
  });

  app.get("/api/calendar/events", (c) => {
    const query = parseQuery(calendarQuerySchema, c.req.query());
    const start = new Date(query.start);
    const end = new Date(query.end);

    if (end.getTime() <= start.getTime()) {
      throw new HTTPException(400, {
        message: "The calendar range end must be after its start."
      });
    }
    if (end.getTime() - start.getTime() > 366 * 86_400_000) {
      throw new HTTPException(400, {
        message: "The calendar range is too large."
      });
    }

    const events: CalendarEvent[] = [];
    for (const feed of listCalendarIcs(db)) {
      if (!feed.rawIcs) continue;
      try {
        events.push(
          ...parseCalendarEvents(feed.rawIcs, start, end, feed.id)
        );
      } catch {
        // A broken feed should not hide events from the other calendars.
      }
    }

    const seen = new Set<string>();
    const unique = events.filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    });

    return c.json(unique.sort((a, b) => a.start.localeCompare(b.start)));
  });

  app.notFound((c) => c.json({ error: { message: "Not found" } }, 404));

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json({ error: { message: error.message } }, error.status);
    }
    console.error(error);
    return c.json({ error: { message: "Internal server error" } }, 500);
  });

  return app;
}
