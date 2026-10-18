import {
  DEFAULT_SETTINGS,
  clampScore,
  clampThreshold,
  createTagSchema,
  createTaskSchema,
  settingsPatchSchema,
  tagColorFor,
  updateTaskSchema,
  type Settings,
  type Tag,
  type Task,
  type TaskView
} from "@eisenhower/shared";
import type { ApiClient, CreateTaskInput, UpdateTaskInput } from "./api";

const STORAGE_KEY = "eisenhower-matrix.v1";

interface StoredTask extends Omit<Task, "tags"> {
  tagIds: string[];
}

interface Store {
  tasks: StoredTask[];
  tags: Tag[];
  settings: Settings;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyStore(): Store {
  return {
    tasks: [],
    tags: [],
    settings: { ...DEFAULT_SETTINGS }
  };
}

function readStore(): Store {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();

    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      settings: {
        threshold: clampThreshold(
          parsed.settings?.threshold ?? DEFAULT_SETTINGS.threshold
        ),
        theme: parsed.settings?.theme === "fog" ? "fog" : "graphite"
      }
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: Store): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    throw new Error("Could not save to this browser's local storage.");
  }
}

function parseMessage(result: {
  success: false;
  error: { issues: Array<{ message: string }> };
}): string {
  return result.error.issues[0]?.message ?? "Invalid input";
}

function toTask(stored: StoredTask, tags: Tag[]): Task {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const { tagIds, ...task } = stored;
  return {
    ...task,
    tags: tagIds
      .map((id) => byId.get(id))
      .filter((tag): tag is Tag => Boolean(tag))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}

function resolveTagIds(ids: string[] | undefined, tags: Tag[]): string[] {
  if (!ids) return [];
  const known = new Set(tags.map((tag) => tag.id));
  return [...new Set(ids)].filter((id) => known.has(id));
}

export const localApi: ApiClient = {
  async listTasks(view: TaskView): Promise<Task[]> {
    const store = readStore();
    return store.tasks
      .filter((task) => {
        if (view === "active") {
          return task.status === "active" && task.archivedAt === null;
        }
        if (view === "completed") {
          return task.status === "completed" && task.archivedAt === null;
        }
        return task.archivedAt !== null;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((task) => toTask(task, store.tags));
  },

  async createTask(input: CreateTaskInput): Promise<Task> {
    const parsed = createTaskSchema.safeParse(input);
    if (!parsed.success) throw new Error(parseMessage(parsed));

    const store = readStore();
    const now = nowIso();
    const task: StoredTask = {
      id: newId(),
      title: parsed.data.title,
      notes: parsed.data.notes ?? "",
      importance: clampScore(parsed.data.importance ?? 50),
      urgency: clampScore(parsed.data.urgency ?? 50),
      dueDate: parsed.data.dueDate ?? null,
      status: "active",
      completedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      tagIds: resolveTagIds(parsed.data.tagIds, store.tags)
    };

    store.tasks.unshift(task);
    writeStore(store);
    return toTask(task, store.tags);
  },

  async updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
    const parsed = updateTaskSchema.safeParse(input);
    if (!parsed.success) throw new Error(parseMessage(parsed));

    const store = readStore();
    const task = store.tasks.find((item) => item.id === id);
    if (!task) throw new Error("Task not found");

    const patch = parsed.data;
    const now = nowIso();

    if (patch.title !== undefined) task.title = patch.title;
    if (patch.notes !== undefined) task.notes = patch.notes;
    if (patch.importance !== undefined) {
      task.importance = clampScore(patch.importance);
    }
    if (patch.urgency !== undefined) task.urgency = clampScore(patch.urgency);
    if (patch.dueDate !== undefined) task.dueDate = patch.dueDate;

    if (patch.status !== undefined) {
      task.status = patch.status;
      task.completedAt =
        patch.status === "completed" ? task.completedAt ?? now : null;
    }

    if (patch.archived !== undefined) {
      task.archivedAt = patch.archived ? task.archivedAt ?? now : null;
    }

    if (patch.tagIds !== undefined) {
      task.tagIds = resolveTagIds(patch.tagIds, store.tags);
    }

    task.updatedAt = now;
    writeStore(store);
    return toTask(task, store.tags);
  },

  async deleteTask(id: string): Promise<{ ok: true }> {
    const store = readStore();
    const index = store.tasks.findIndex((task) => task.id === id);
    if (index === -1) throw new Error("Task not found");

    store.tasks.splice(index, 1);
    writeStore(store);
    return { ok: true };
  },

  async listTags(): Promise<Tag[]> {
    const store = readStore();
    return [...store.tags].sort((a, b) => a.name.localeCompare(b.name));
  },

  async createTag(name: string): Promise<Tag> {
    const parsed = createTagSchema.safeParse({ name });
    if (!parsed.success) throw new Error(parseMessage(parsed));

    const store = readStore();
    if (store.tags.some((tag) => tag.name === parsed.data.name)) {
      throw new Error("A tag with that name already exists");
    }

    const tag: Tag = {
      id: newId(),
      name: parsed.data.name,
      color: parsed.data.color ?? tagColorFor(parsed.data.name)
    };
    store.tags.push(tag);
    writeStore(store);
    return tag;
  },

  async deleteTag(id: string): Promise<{ ok: true }> {
    const store = readStore();
    store.tags = store.tags.filter((tag) => tag.id !== id);
    for (const task of store.tasks) {
      task.tagIds = task.tagIds.filter((tagId) => tagId !== id);
    }
    writeStore(store);
    return { ok: true };
  },

  async getSettings(): Promise<Settings> {
    return readStore().settings;
  },

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const parsed = settingsPatchSchema.safeParse(patch);
    if (!parsed.success) throw new Error(parseMessage(parsed));

    const store = readStore();
    const next: Settings = {
      threshold:
        parsed.data.threshold !== undefined
          ? clampThreshold(parsed.data.threshold)
          : store.settings.threshold,
      theme: parsed.data.theme ?? store.settings.theme
    };
    store.settings = next;
    writeStore(store);
    return next;
  }
};
