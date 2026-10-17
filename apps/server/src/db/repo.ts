import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, like, or } from "drizzle-orm";
import {
  DEFAULT_SETTINGS,
  clampScore,
  clampThreshold,
  tagColorFor,
  type Settings,
  type Tag,
  type Task,
  type TaskStatus,
  type TaskView
} from "@eisenhower/shared";
import type { AppDb } from "./client";
import { settings as settingsTable, tags, taskTags, tasks } from "./schema";
import type { TaskRow } from "./schema";

export interface CreateTaskInput {
  title: string;
  notes?: string;
  importance?: number;
  urgency?: number;
  dueDate?: string | null;
  tagIds?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string;
  importance?: number;
  urgency?: number;
  dueDate?: string | null;
  tagIds?: string[];
  status?: TaskStatus;
  archived?: boolean;
}

export interface ListTasksInput {
  view?: TaskView;
  q?: string;
  tagIds?: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapTask(row: TaskRow, taskTagsList: Tag[]): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    importance: row.importance,
    urgency: row.urgency,
    dueDate: row.dueDate,
    status: row.status as TaskStatus,
    completedAt: row.completedAt,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tags: taskTagsList
  };
}

function tagsForTasks(db: AppDb, taskIds: string[]): Map<string, Tag[]> {
  const result = new Map<string, Tag[]>();
  if (taskIds.length === 0) return result;

  const rows = db
    .select({
      taskId: taskTags.taskId,
      id: tags.id,
      name: tags.name,
      color: tags.color
    })
    .from(taskTags)
    .innerJoin(tags, eq(taskTags.tagId, tags.id))
    .where(inArray(taskTags.taskId, taskIds))
    .all();

  for (const row of rows) {
    const list = result.get(row.taskId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    result.set(row.taskId, list);
  }

  for (const list of result.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return result;
}

export function getTaskById(db: AppDb, id: string): Task | null {
  const row = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!row) return null;
  return mapTask(row, tagsForTasks(db, [id]).get(id) ?? []);
}

export function listTasks(db: AppDb, input: ListTasksInput): Task[] {
  const view = input.view ?? "active";
  const conditions = [];

  if (view === "active") {
    conditions.push(eq(tasks.status, "active"), isNull(tasks.archivedAt));
  } else if (view === "completed") {
    conditions.push(eq(tasks.status, "completed"), isNull(tasks.archivedAt));
  } else {
    conditions.push(isNotNull(tasks.archivedAt));
  }

  if (input.q) {
    const pattern = `%${input.q}%`;
    conditions.push(or(like(tasks.title, pattern), like(tasks.notes, pattern))!);
  }

  if (input.tagIds?.length) {
    const taggedIds = db
      .select({ taskId: taskTags.taskId })
      .from(taskTags)
      .where(inArray(taskTags.tagId, input.tagIds))
      .all()
      .map((row) => row.taskId);

    const unique = [...new Set(taggedIds)];
    if (unique.length === 0) return [];
    conditions.push(inArray(tasks.id, unique));
  }

  const rows = db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(desc(tasks.updatedAt))
    .all();

  const tagMap = tagsForTasks(
    db,
    rows.map((row) => row.id)
  );

  return rows.map((row) => mapTask(row, tagMap.get(row.id) ?? []));
}

export function createTask(db: AppDb, input: CreateTaskInput): Task {
  const id = randomUUID();
  const now = nowIso();
  const tagIds = [...new Set(input.tagIds ?? [])];

  db.transaction((tx) => {
    tx.insert(tasks)
      .values({
        id,
        title: input.title,
        notes: input.notes ?? "",
        importance: clampScore(input.importance ?? 50),
        urgency: clampScore(input.urgency ?? 50),
        dueDate: input.dueDate ?? null,
        status: "active",
        completedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now
      })
      .run();

    if (tagIds.length > 0) {
      tx.insert(taskTags)
        .values(tagIds.map((tagId) => ({ taskId: id, tagId })))
        .onConflictDoNothing()
        .run();
    }
  });

  return getTaskById(db, id)!;
}

export function updateTask(
  db: AppDb,
  id: string,
  input: UpdateTaskInput
): Task | null {
  const existing = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!existing) return null;

  const now = nowIso();
  const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: now };

  if (input.title !== undefined) patch.title = input.title;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.importance !== undefined) patch.importance = clampScore(input.importance);
  if (input.urgency !== undefined) patch.urgency = clampScore(input.urgency);
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate;

  if (input.status !== undefined) {
    patch.status = input.status;
    patch.completedAt =
      input.status === "completed" ? existing.completedAt ?? now : null;
  }

  if (input.archived !== undefined) {
    patch.archivedAt = input.archived ? existing.archivedAt ?? now : null;
  }

  db.transaction((tx) => {
    tx.update(tasks).set(patch).where(eq(tasks.id, id)).run();

    if (input.tagIds !== undefined) {
      tx.delete(taskTags).where(eq(taskTags.taskId, id)).run();
      const unique = [...new Set(input.tagIds)];
      if (unique.length > 0) {
        tx.insert(taskTags)
          .values(unique.map((tagId) => ({ taskId: id, tagId })))
          .onConflictDoNothing()
          .run();
      }
    }
  });

  return getTaskById(db, id);
}

export function deleteTask(db: AppDb, id: string): boolean {
  return db.delete(tasks).where(eq(tasks.id, id)).run().changes > 0;
}

export function listTags(db: AppDb): Tag[] {
  return db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .orderBy(tags.name)
    .all();
}

export function createTag(
  db: AppDb,
  input: { name: string; color?: string }
): Tag {
  const id = randomUUID();
  const color = input.color ?? tagColorFor(input.name);
  db.insert(tags).values({ id, name: input.name, color }).run();
  return { id, name: input.name, color };
}

export function updateTag(
  db: AppDb,
  id: string,
  input: { name?: string; color?: string }
): Tag | null {
  const patch: Partial<typeof tags.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.color !== undefined) patch.color = input.color;
  if (Object.keys(patch).length === 0) {
    return db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .where(eq(tags.id, id))
      .get() ?? null;
  }

  const changed = db.update(tags).set(patch).where(eq(tags.id, id)).run().changes;
  if (!changed) return null;
  return (
    db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .where(eq(tags.id, id))
      .get() ?? null
  );
}

export function deleteTag(db: AppDb, id: string): boolean {
  return db.delete(tags).where(eq(tags.id, id)).run().changes > 0;
}

export function getSettings(db: AppDb): Settings {
  const row = db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, "app"))
    .get();

  if (!row) return { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(row.value) as Partial<Settings>;
    return {
      threshold: clampThreshold(parsed.threshold ?? DEFAULT_SETTINGS.threshold),
      theme: parsed.theme === "fog" ? "fog" : "graphite"
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateSettings(db: AppDb, patch: Partial<Settings>): Settings {
  const next: Settings = {
    threshold:
      patch.threshold !== undefined
        ? clampThreshold(patch.threshold)
        : getSettings(db).threshold,
    theme: patch.theme ?? getSettings(db).theme
  };

  db.insert(settingsTable)
    .values({ key: "app", value: JSON.stringify(next) })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: JSON.stringify(next) }
    })
    .run();

  return next;
}
