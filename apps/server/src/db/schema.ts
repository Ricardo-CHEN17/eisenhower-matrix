import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text
} from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    importance: integer("importance").notNull().default(50),
    urgency: integer("urgency").notNull().default(50),
    dueDate: text("due_date"),
    scheduledStart: text("scheduled_start"),
    scheduledEnd: text("scheduled_end"),
    status: text("status", { enum: ["active", "completed"] })
      .notNull()
      .default("active"),
    completedAt: text("completed_at"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    index("idx_tasks_view").on(table.status, table.archivedAt),
    index("idx_tasks_due").on(table.dueDate)
  ]
);

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull()
});

export const taskTags = sqliteTable(
  "task_tags",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" })
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.tagId] }),
    index("idx_task_tags_tag").on(table.tagId)
  ]
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull()
});

export const calendarSubscriptions = sqliteTable("calendar_subscriptions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  sourceType: text("source_type", { enum: ["url", "file"] })
    .notNull()
    .default("url"),
  url: text("url"),
  rawIcs: text("raw_ics").notNull().default(""),
  lastFetchedAt: text("last_fetched_at"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type TaskRow = typeof tasks.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type CalendarSubscriptionRow = typeof calendarSubscriptions.$inferSelect;
