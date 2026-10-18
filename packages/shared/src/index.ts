import { z } from "zod";

export * from "./calendar";

export const TASK_STATUSES = ["active", "completed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_VIEWS = ["active", "completed", "archived"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export const THEMES = ["graphite", "fog"] as const;
export type Theme = (typeof THEMES)[number];

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;
export const THRESHOLD_MIN = 30;
export const THRESHOLD_MAX = 70;
export const THRESHOLD_DEFAULT = 50;

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  importance: number;
  urgency: number;
  dueDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  status: TaskStatus;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: Tag[];
}

export interface Settings {
  threshold: number;
  theme: Theme;
}

export const DEFAULT_SETTINGS: Settings = {
  threshold: THRESHOLD_DEFAULT,
  theme: "graphite"
};

export const QUADRANTS = {
  1: { key: "q1", name: "Do now", hint: "Handle today · keep it small" },
  2: { key: "q2", name: "Schedule", hint: "Highest leverage · protect time" },
  3: { key: "q3", name: "Batch", hint: "Clear in batches · delete what you can" },
  4: { key: "q4", name: "Drop", hint: "Delete or let go" }
} as const;

export type KnownQuadrant = 1 | 2 | 3 | 4;
export type Quadrant = KnownQuadrant | "pending";

export function clampScore(value: number): number {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(safe)));
}

export function clampThreshold(value: number): number {
  const safe = Number.isFinite(value) ? value : THRESHOLD_DEFAULT;
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, Math.round(safe)));
}

export function quadrantOf(
  task: Pick<Task, "importance" | "urgency">,
  threshold: number
): Quadrant {
  if (task.importance === threshold && task.urgency === threshold) return "pending";
  const important = task.importance >= threshold;
  const urgent = task.urgency >= threshold;
  return important ? (urgent ? 1 : 2) : (urgent ? 3 : 4);
}

export function isPending(task: Pick<Task, "importance" | "urgency">, threshold: number): boolean {
  return task.importance === threshold && task.urgency === threshold;
}

export function isTaskArchived(task: Pick<Task, "archivedAt">): boolean {
  return Boolean(task.archivedAt);
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const dateSchema = z
  .string()
  .regex(datePattern, "Use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid date");

export const dateTimeSchema = z.string().datetime();

function validSchedule(input: {
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
}): boolean {
  if (
    input.scheduledStart === undefined ||
    input.scheduledEnd === undefined ||
    input.scheduledStart === null ||
    input.scheduledEnd === null
  ) {
    return true;
  }
  return (
    new Date(input.scheduledEnd).getTime() >
    new Date(input.scheduledStart).getTime()
  );
}

export const scoreSchema = z.number().finite().transform(clampScore);

export const tagIdsSchema = z.array(z.string().min(1)).max(50);

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    notes: z.string().max(5000).optional(),
    importance: scoreSchema.optional(),
    urgency: scoreSchema.optional(),
    dueDate: dateSchema.nullable().optional(),
    scheduledStart: dateTimeSchema.nullable().optional(),
    scheduledEnd: dateTimeSchema.nullable().optional(),
    tagIds: tagIdsSchema.optional()
  })
  .refine(validSchedule, "End time must be after start time");

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    notes: z.string().max(5000).optional(),
    importance: scoreSchema.optional(),
    urgency: scoreSchema.optional(),
    dueDate: dateSchema.nullable().optional(),
    scheduledStart: dateTimeSchema.nullable().optional(),
    scheduledEnd: dateTimeSchema.nullable().optional(),
    tagIds: tagIdsSchema.optional(),
    status: z.enum(TASK_STATUSES).optional(),
    archived: z.boolean().optional()
  })
  .refine(validSchedule, "End time must be after start time");

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(30),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color")
    .optional()
});

export const updateTagSchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color")
    .optional()
});

export const settingsPatchSchema = z
  .object({
    threshold: z.number().int().min(THRESHOLD_MIN).max(THRESHOLD_MAX).optional(),
    theme: z.enum(THEMES).optional()
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const listTasksQuerySchema = z.object({
  view: z.enum(TASK_VIEWS).default("active"),
  q: z.string().trim().max(200).optional(),
  tagIds: z.string().optional()
});

export const TAG_PALETTE = [
  "#4EA8FF",
  "#B388FF",
  "#3DDC97",
  "#FFC857",
  "#FF7A90",
  "#9AA4B2",
  "#FF9F43"
] as const;

export function tagColorFor(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }
  return TAG_PALETTE[hash % TAG_PALETTE.length]!;
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysBetween(fromDateKey: string, toDateKey: string): number {
  const from = new Date(`${fromDateKey}T00:00:00Z`).getTime();
  const to = new Date(`${toDateKey}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export type DueState = "overdue" | "today" | "soon" | "later" | "none";

export function dueState(
  dueDate: string | null,
  today: Date = new Date()
): DueState {
  if (!dueDate) return "none";
  const diff = daysBetween(toDateKey(today), dueDate);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 3) return "soon";
  return "later";
}

export function dueLabel(dueDate: string | null, today: Date = new Date()): string {
  if (!dueDate) return "";
  const diff = daysBetween(toDateKey(today), dueDate);
  if (diff < 0) return `Overdue ${Math.abs(diff)}d`;
  if (diff === 0) return "Today";
  if (diff <= 3) return `${diff}d left`;
  return dueDate.slice(5).replace("-", "/");
}
