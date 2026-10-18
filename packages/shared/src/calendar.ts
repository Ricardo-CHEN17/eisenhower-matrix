import ICAL from "ical.js";
import { z } from "zod";

export const CALENDAR_SOURCE_TYPES = ["url", "file"] as const;
export type CalendarSourceType = (typeof CALENDAR_SOURCE_TYPES)[number];

export interface CalendarSubscription {
  id: string;
  name: string;
  color: string;
  sourceType: CalendarSourceType;
  url: string | null;
  lastFetchedAt: string | null;
  lastError: string | null;
}

export interface CalendarEvent {
  id: string;
  subscriptionId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  url: string | null;
}

export const CALENDAR_PALETTE = [
  "#4EA8FF",
  "#B388FF",
  "#3DDC97",
  "#FFC857",
  "#FF7A90",
  "#9AA4B2",
  "#FF9F43"
] as const;

export function calendarColorFor(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }
  return CALENDAR_PALETTE[hash % CALENDAR_PALETTE.length]!;
}

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color");
const isoDateTimeSchema = z.string().datetime();

export const createCalendarSubscriptionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  url: z.string().trim().min(1),
  color: colorSchema.optional(),
  proxyUrl: z.string().trim().url().optional()
});

export const importCalendarSchema = z.object({
  name: z.string().trim().min(1).max(60),
  ics: z.string().min(1).max(5_000_000),
  color: colorSchema.optional()
});

export const calendarQuerySchema = z.object({
  start: isoDateTimeSchema,
  end: isoDateTimeSchema
});

export type CreateCalendarSubscriptionInput = z.infer<
  typeof createCalendarSubscriptionSchema
>;
export type ImportCalendarInput = z.infer<typeof importCalendarSchema>;

export function normalizeCalendarUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("webcal://")) {
    return `https://${trimmed.slice("webcal://".length)}`;
  }
  if (trimmed.startsWith("webcals://")) {
    return `https://${trimmed.slice("webcals://".length)}`;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function isValidCalendarIcs(ics: string): boolean {
  try {
    const calendar = new ICAL.Component(ICAL.parse(ics));
    return calendar.name === "vcalendar";
  } catch {
    return false;
  }
}

interface ParsedOccurrence {
  event: ICAL.Event;
  start: Date;
  end: Date;
  allDay: boolean;
}

function textProperty(event: ICAL.Event, name: string): string | null {
  const value = event.component.getFirstPropertyValue(name);
  return typeof value === "string" && value.trim() ? value : null;
}

function eventEnd(event: ICAL.Event, start: Date, allDay: boolean): Date {
  const end = event.endDate?.toJSDate();
  if (end && end.getTime() > start.getTime()) return end;
  return new Date(start.getTime() + (allDay ? 86_400_000 : 3_600_000));
}

function overlaps(
  start: Date,
  end: Date,
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  return start.getTime() < rangeEnd.getTime() && end.getTime() > rangeStart.getTime();
}

function toCalendarEvent(
  subscriptionId: string,
  occurrence: ParsedOccurrence,
  fallbackUid: string
): CalendarEvent {
  const { event, start, end, allDay } = occurrence;
  const uid = event.uid || fallbackUid;
  return {
    id: `${uid}:${start.toISOString()}`,
    subscriptionId,
    title: event.summary || "(No title)",
    start: start.toISOString(),
    end: end.toISOString(),
    allDay,
    location: event.location || null,
    notes: event.description || null,
    url: textProperty(event, "url")
  };
}

/**
 * Parse an ICS feed and expand recurring events into the requested range.
 * Recurrence exceptions and EXDATEs are handled by ical.js.
 */
export function parseCalendarEvents(
  ics: string,
  rangeStart: Date,
  rangeEnd: Date,
  subscriptionId: string
): CalendarEvent[] {
  let calendar: ICAL.Component;
  try {
    calendar = new ICAL.Component(ICAL.parse(ics));
  } catch {
    throw new Error("Could not parse this calendar file.");
  }

  const events: CalendarEvent[] = [];
  const seen = new Set<string>();
  const maxEvents = 5000;
  const maxIterations = 100_000;
  let index = 0;

  for (const component of calendar.getAllSubcomponents("vevent")) {
    index++;
    if (component.hasProperty("recurrence-id")) continue;

    const event = new ICAL.Event(component);
    if (event.component.getFirstPropertyValue("status") === "CANCELLED") {
      continue;
    }

    if (!event.isRecurring()) {
      const start = event.startDate?.toJSDate();
      if (!start) continue;
      const allDay = Boolean(event.startDate?.isDate);
      const end = eventEnd(event, start, allDay);
      if (!overlaps(start, end, rangeStart, rangeEnd)) continue;

      const parsed = toCalendarEvent(
        subscriptionId,
        { event, start, end, allDay },
        `event-${index}`
      );
      if (!seen.has(parsed.id)) {
        seen.add(parsed.id);
        events.push(parsed);
      }
      continue;
    }

    const iterator = event.iterator();
    let iterations = 0;
    while (iterations < maxIterations && events.length < maxEvents) {
      iterations++;
      const next = iterator.next();
      if (!next) break;

      const occurrenceStart = next.toJSDate();
      if (occurrenceStart.getTime() > rangeEnd.getTime()) break;

      const details = event.getOccurrenceDetails(next);
      const occurrenceEvent = details.item;
      if (
        occurrenceEvent.component.getFirstPropertyValue("status") ===
        "CANCELLED"
      ) {
        continue;
      }

      const start = details.startDate.toJSDate();
      const allDay = Boolean(details.startDate.isDate);
      const end = eventEnd(occurrenceEvent, start, allDay);
      if (!overlaps(start, end, rangeStart, rangeEnd)) continue;

      const parsed = toCalendarEvent(
        subscriptionId,
        { event: occurrenceEvent, start, end, allDay },
        `event-${index}`
      );
      if (!seen.has(parsed.id)) {
        seen.add(parsed.id);
        events.push(parsed);
      }
    }
  }

  return events.sort((a, b) => a.start.localeCompare(b.start));
}
