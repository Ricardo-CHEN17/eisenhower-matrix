import { toDateKey, type Tag } from "@eisenhower/shared";
import { createDb } from "./db/client";
import { createTag, createTask, listTasks } from "./db/repo";

function dateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

const { db, sqlite } = createDb();

if (listTasks(db, { view: "active" }).length > 0) {
  console.log("Database already has active tasks. Seed skipped.");
  sqlite.close();
  process.exit(0);
}

const tagDefs = [
  ["Work", "#4EA8FF"],
  ["Growth", "#B388FF"],
  ["Health", "#3DDC97"],
  ["Errands", "#FFC857"],
  ["Comms", "#FF7A90"],
  ["Tidy", "#9AA4B2"],
  ["Life", "#FF9F43"]
] as const;

const tagMap = new Map<string, Tag>();
for (const [name, color] of tagDefs) {
  tagMap.set(name, createTag(db, { name, color }));
}

function tagIds(...names: string[]): string[] {
  return names.map((name) => tagMap.get(name)!.id);
}

const sampleTasks = [
  { title: "Submit Q3 report", importance: 92, urgency: 88, dueDate: dateOffset(0), tagIds: tagIds("Work"), notes: "Pull the Q3 numbers together. Lead with growth and risk." },
  { title: "Fix payment incident", importance: 94, urgency: 96, dueDate: dateOffset(-1), tagIds: tagIds("Work"), notes: "About 3% of orders are affected. Handle this first." },
  { title: "Reply to client contract", importance: 76, urgency: 82, dueDate: dateOffset(1), tagIds: tagIds("Work", "Comms"), notes: "Legal has left comments on the redlines." },
  { title: "Prepare promotion packet", importance: 90, urgency: 35, dueDate: dateOffset(18), tagIds: tagIds("Growth"), notes: "Collect two years of projects and impact." },
  { title: "Draft technical proposal", importance: 84, urgency: 22, dueDate: dateOffset(12), tagIds: tagIds("Work"), notes: "Start with a one-page outline." },
  { title: "Book annual checkup", importance: 72, urgency: 18, dueDate: null, tagIds: tagIds("Health"), notes: "Check for open slots at the end of the month." },
  { title: "File expense report", importance: 38, urgency: 85, dueDate: dateOffset(2), tagIds: tagIds("Errands"), notes: "Two receipts are still missing." },
  { title: "Reply in group chat", importance: 20, urgency: 90, dueDate: null, tagIds: tagIds("Comms"), notes: "" },
  { title: "Renew cloud plan", importance: 30, urgency: 70, dueDate: dateOffset(4), tagIds: tagIds("Errands"), notes: "Auto-renew is turned off." },
  { title: "Organize old notes", importance: 18, urgency: 15, dueDate: null, tagIds: tagIds("Tidy"), notes: "" },
  { title: "Explore new framework", importance: 42, urgency: 28, dueDate: null, tagIds: tagIds("Growth"), notes: "" },
  { title: "Clean downloads folder", importance: 12, urgency: 10, dueDate: null, tagIds: tagIds("Tidy"), notes: "" },
  { title: "Update personal site", importance: 35, urgency: 25, dueDate: null, tagIds: tagIds("Growth"), notes: "" },
  { title: "Book dentist", importance: 45, urgency: 40, dueDate: dateOffset(23), tagIds: tagIds("Health"), notes: "" },
  { title: "Charge camera battery", importance: 10, urgency: 60, dueDate: dateOffset(0), tagIds: tagIds("Errands"), notes: "" },
  { title: "Buy coffee beans", importance: 8, urgency: 75, dueDate: dateOffset(1), tagIds: tagIds("Life"), notes: "" },
  { title: "Reply to comments", importance: 25, urgency: 88, dueDate: null, tagIds: tagIds("Comms"), notes: "" },
  { title: "Process notifications", importance: 22, urgency: 86, dueDate: dateOffset(-1), tagIds: tagIds("Errands"), notes: "" },
  { title: "Fill out survey", importance: 28, urgency: 84, dueDate: dateOffset(3), tagIds: tagIds("Errands"), notes: "" },
  { title: "Sort email", importance: 20, urgency: 20, dueDate: null, tagIds: tagIds("Tidy"), notes: "" },
  { title: "Clear desktop", importance: 22, urgency: 18, dueDate: null, tagIds: tagIds("Tidy"), notes: "" },
  { title: "Archive screenshots", importance: 15, urgency: 25, dueDate: null, tagIds: tagIds("Tidy"), notes: "" },
  { title: "Back up photos", importance: 25, urgency: 15, dueDate: null, tagIds: tagIds("Tidy"), notes: "" },
  { title: "Review weekly bills", importance: 56, urgency: 72, dueDate: dateOffset(2), tagIds: tagIds("Errands"), notes: "Check subscription spend first." }
];

for (const task of sampleTasks) {
  createTask(db, task);
}

console.log(`Seeded ${sampleTasks.length} tasks and ${tagDefs.length} tags.`);
sqlite.close();
