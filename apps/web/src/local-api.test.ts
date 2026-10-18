import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localApi } from "./local-api";

class MemoryStorage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: new MemoryStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("localApi", () => {
  it("creates, updates, lists, and deletes tasks across views", async () => {
    const task = await localApi.createTask({
      title: "Write report",
      importance: 80,
      urgency: 30
    });

    expect(task.title).toBe("Write report");
    expect(task.status).toBe("active");
    expect(await localApi.listTasks("active")).toHaveLength(1);

    const completed = await localApi.updateTask(task.id, {
      importance: 90,
      status: "completed"
    });
    expect(completed.importance).toBe(90);
    expect(completed.completedAt).not.toBeNull();

    expect(await localApi.listTasks("active")).toHaveLength(0);
    expect(await localApi.listTasks("completed")).toHaveLength(1);

    await localApi.deleteTask(task.id);
    expect(await localApi.listTasks("completed")).toHaveLength(0);
  });

  it("archives and restores tasks", async () => {
    const task = await localApi.createTask({ title: "Old task" });

    await localApi.updateTask(task.id, { archived: true });
    expect(await localApi.listTasks("active")).toHaveLength(0);
    expect(await localApi.listTasks("archived")).toHaveLength(1);

    await localApi.updateTask(task.id, { archived: false });
    expect(await localApi.listTasks("active")).toHaveLength(1);
    expect(await localApi.listTasks("archived")).toHaveLength(0);
  });

  it("attaches tags, sorts them, and removes them when the tag is deleted", async () => {
    const work = await localApi.createTag("work");
    const personal = await localApi.createTag("personal");
    const task = await localApi.createTask({
      title: "Plan",
      tagIds: [work.id, personal.id]
    });

    expect(task.tags.map((tag) => tag.name)).toEqual(["personal", "work"]);

    await localApi.deleteTag(work.id);
    const [after] = await localApi.listTasks("active");
    expect(after?.tags.map((tag) => tag.name)).toEqual(["personal"]);
  });

  it("rejects duplicate tag names", async () => {
    await localApi.createTag("work");
    await expect(localApi.createTag("work")).rejects.toThrow(
      "A tag with that name already exists"
    );
  });

  it("persists settings", async () => {
    const settings = await localApi.updateSettings({
      theme: "fog",
      threshold: 60
    });

    expect(settings).toEqual({ theme: "fog", threshold: 60 });
    expect(await localApi.getSettings()).toEqual({
      theme: "fog",
      threshold: 60
    });
  });

  it("rejects invalid task input", async () => {
    await expect(localApi.createTask({ title: "   " })).rejects.toThrow();
  });
});
