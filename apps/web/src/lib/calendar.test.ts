import { describe, expect, it } from "vitest";
import {
  isValidCalendarIcs,
  normalizeCalendarUrl,
  parseCalendarEvents
} from "@eisenhower/shared";
import { combineLocal, layoutDayItems, timeFromIso } from "./calendar";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:meeting
SUMMARY:Team meeting
DTSTART:20261019T090000Z
DTEND:20261019T100000Z
END:VEVENT
BEGIN:VEVENT
UID:standup
SUMMARY:Daily standup
DTSTART:20261019T010000Z
DTEND:20261019T011500Z
RRULE:FREQ=DAILY;COUNT=5
END:VEVENT
BEGIN:VEVENT
UID:standup
RECURRENCE-ID:20261021T010000Z
SUMMARY:Standup moved
DTSTART:20261021T020000Z
DTEND:20261021T021500Z
END:VEVENT
BEGIN:VEVENT
UID:holiday
SUMMARY:Holiday
DTSTART;VALUE=DATE:20261020
DTEND;VALUE=DATE:20261021
END:VEVENT
END:VCALENDAR`;

const RANGE_START = new Date("2026-10-18T00:00:00Z");
const RANGE_END = new Date("2026-10-25T00:00:00Z");

describe("calendar parsing", () => {
  it("parses timed, all-day, recurring, and moved occurrences", () => {
    const events = parseCalendarEvents(
      ICS,
      RANGE_START,
      RANGE_END,
      "calendar-1"
    );

    const meeting = events.find((event) => event.title === "Team meeting");
    expect(meeting?.start).toBe("2026-10-19T09:00:00.000Z");
    expect(meeting?.allDay).toBe(false);

    const holiday = events.find((event) => event.title === "Holiday");
    expect(holiday?.allDay).toBe(true);

    const standups = events.filter(
      (event) =>
        event.title === "Daily standup" || event.title === "Standup moved"
    );
    expect(standups).toHaveLength(5);
    expect(
      standups.some((event) => event.title === "Standup moved")
    ).toBe(true);
  });

  it("ignores events outside the requested range", () => {
    const events = parseCalendarEvents(
      ICS,
      new Date("2026-11-01T00:00:00Z"),
      new Date("2026-11-08T00:00:00Z"),
      "calendar-1"
    );
    expect(events).toHaveLength(0);
  });

  it("validates ICS content", () => {
    expect(isValidCalendarIcs(ICS)).toBe(true);
    expect(isValidCalendarIcs("not a calendar")).toBe(false);
  });

  it("normalizes webcal URLs", () => {
    expect(normalizeCalendarUrl("webcal://example.com/calendar.ics")).toBe(
      "https://example.com/calendar.ics"
    );
    expect(normalizeCalendarUrl("example.com/calendar.ics")).toBe(
      "https://example.com/calendar.ics"
    );
    expect(normalizeCalendarUrl("https://example.com/calendar.ics")).toBe(
      "https://example.com/calendar.ics"
    );
  });
});

describe("calendar layout helpers", () => {
  it("round-trips local date and time", () => {
    const iso = combineLocal("2026-10-20", "09:30");
    expect(timeFromIso(iso)).toBe("09:30");
    expect(new Date(iso).getDate()).toBe(20);
  });

  it("places overlapping items side by side", () => {
    const positioned = layoutDayItems([
      { id: "a", start: "2026-10-20T09:00:00.000Z", end: "2026-10-20T10:00:00.000Z" },
      { id: "b", start: "2026-10-20T09:30:00.000Z", end: "2026-10-20T10:30:00.000Z" },
      { id: "c", start: "2026-10-20T11:00:00.000Z", end: "2026-10-20T12:00:00.000Z" }
    ]);

    const a = positioned.find((item) => item.item.id === "a")!;
    const b = positioned.find((item) => item.item.id === "b")!;
    const c = positioned.find((item) => item.item.id === "c")!;

    expect(a.columns).toBe(2);
    expect(b.columns).toBe(2);
    expect(a.column).not.toBe(b.column);
    expect(a.conflict).toBe(true);
    expect(c.columns).toBe(1);
    expect(c.conflict).toBe(false);
  });
});
