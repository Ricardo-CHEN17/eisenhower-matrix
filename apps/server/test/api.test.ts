import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Settings, Tag, Task } from "@eisenhower/shared";
import { createApp } from "../src/app";
import { createDb, type DbContext } from "../src/db/client";

describe("API", () => {
  let context: DbContext;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    context = createDb(":memory:");
    app = createApp(context.db);
  });

  afterEach(() => {
    context.sqlite.close();
  });

  async function request(path: string, init?: RequestInit) {
    const response = await app.request(path, init);
    const body = await response.json().catch(() => null);
    return { response, body };
  }

  function json(body: unknown): RequestInit {
    return {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    };
  }

  it("reports health", async () => {
    const { response, body } = await request("/api/health");
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it("creates tasks at 50/50 and rounds scores on update", async () => {
    const created = await request(
      "/api/tasks",
      json({ title: "New task", notes: "Some context" })
    );

    expect(created.response.status).toBe(201);
    const task = created.body as Task;
    expect(task.title).toBe("New task");
    expect(task.importance).toBe(50);
    expect(task.urgency).toBe(50);
    expect(task.status).toBe("active");

    const patched = await request(
      `/api/tasks/${task.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ importance: 50.6, urgency: 120 })
      }
    );

    expect(patched.response.status).toBe(200);
    const updated = patched.body as Task;
    expect(updated.importance).toBe(51);
    expect(updated.urgency).toBe(100);
  });

  it("validates empty titles", async () => {
    const created = await request("/api/tasks", json({ title: "   " }));
    expect(created.response.status).toBe(400);
  });

  it("assigns tags and filters by tag", async () => {
    const tagRes = await request(
      "/api/tags",
      json({ name: "Work", color: "#0087EE" })
    );
    expect(tagRes.response.status).toBe(201);
    const tag = tagRes.body as Tag;

    const taskRes = await request(
      "/api/tasks",
      json({ title: "Tagged task", tagIds: [tag.id] })
    );
    expect(taskRes.response.status).toBe(201);
    const task = taskRes.body as Task;
    expect(task.tags.map((item) => item.name)).toEqual(["Work"]);

    const filtered = await request(`/api/tasks?tagIds=${tag.id}`);
    expect(filtered.response.status).toBe(200);
    expect((filtered.body as Task[]).map((item) => item.id)).toEqual([task.id]);

    const none = await request("/api/tasks?tagIds=missing");
    expect(none.response.status).toBe(200);
    expect(none.body).toEqual([]);
  });

  it("moves tasks through completed and archived views", async () => {
    const created = await request("/api/tasks", json({ title: "Lifecycle" }));
    const task = created.body as Task;

    const complete = await request(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "completed" })
    });
    expect(complete.response.status).toBe(200);

    const completed = await request("/api/tasks?view=completed");
    expect((completed.body as Task[]).map((item) => item.id)).toEqual([task.id]);

    const archived = await request(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true })
    });
    expect(archived.response.status).toBe(200);

    const archivedList = await request("/api/tasks?view=archived");
    expect((archivedList.body as Task[]).map((item) => item.id)).toEqual([
      task.id
    ]);

    const restored = await request(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: false })
    });
    expect(restored.response.status).toBe(200);

    const completedAgain = await request("/api/tasks?view=completed");
    expect((completedAgain.body as Task[]).map((item) => item.id)).toEqual([
      task.id
    ]);
  });

  it("reads and updates settings", async () => {
    const initial = await request("/api/settings");
    expect(initial.response.status).toBe(200);
    expect(initial.body).toEqual({ threshold: 50, theme: "graphite" });

    const updated = await request("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threshold: 40, theme: "fog" })
    });
    expect(updated.response.status).toBe(200);
    expect(updated.body).toEqual({ threshold: 40, theme: "fog" });

    const read = await request("/api/settings");
    expect(read.body as Settings).toEqual({ threshold: 40, theme: "fog" });
  });

  it("rejects out-of-range settings", async () => {
    const updated = await request("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threshold: 20 })
    });
    expect(updated.response.status).toBe(400);
  });

  it("deletes tasks", async () => {
    const created = await request("/api/tasks", json({ title: "Delete me" }));
    const task = created.body as Task;

    const deleted = await request(`/api/tasks/${task.id}`, {
      method: "DELETE"
    });
    expect(deleted.response.status).toBe(200);

    const active = await request("/api/tasks");
    expect(active.body).toEqual([]);
  });
});
