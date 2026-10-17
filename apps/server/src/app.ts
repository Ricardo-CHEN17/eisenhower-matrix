import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import {
  createTagSchema,
  createTaskSchema,
  listTasksQuerySchema,
  settingsPatchSchema,
  updateTagSchema,
  updateTaskSchema
} from "@eisenhower/shared";
import type { AppDb } from "./db/client";
import {
  createTag,
  createTask,
  deleteTag,
  deleteTask,
  getSettings,
  getTaskById,
  listTags,
  listTasks,
  updateSettings,
  updateTag,
  updateTask
} from "./db/repo";

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
