import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  dueLabel,
  dueState,
  quadrantOf,
  type CalendarEvent,
  type Task
} from "@eisenhower/shared";
import { useCalendarEvents, useCalendars, useRefreshAllCalendars } from "../hooks";
import {
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  HOUR_HEIGHT,
  addDays,
  addWeeks,
  formatHour,
  formatTime,
  localDateKey,
  layoutDayItems,
  minutesFromMidnight,
  overlaps,
  startOfWeek,
  weekLabel,
  type PositionedItem
} from "../lib/calendar";
import { CalendarsDialog } from "./CalendarsDialog";

interface CalendarViewProps {
  tasks: Task[];
  threshold: number;
  selectedId: string | null;
  onSelect: (task: Task) => void;
  onError: (message: string) => void;
}

type TimedSegment =
  | {
      kind: "event";
      id: string;
      start: string;
      end: string;
      event: CalendarEvent;
      color: string;
    }
  | {
      kind: "task";
      id: string;
      start: string;
      end: string;
      task: Task;
      qClass: string;
    };

interface DayData {
  date: Date;
  key: string;
  allDay: CalendarEvent[];
  due: Task[];
  timed: Array<PositionedItem<TimedSegment>>;
}

const GRID_START = CALENDAR_START_HOUR * 60;
const GRID_END = CALENDAR_END_HOUR * 60;
const GRID_HEIGHT = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * HOUR_HEIGHT;
const HOURS = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 },
  (_, index) => CALENDAR_START_HOUR + index
);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function segmentRange(
  start: string,
  end: string,
  dayStart: string,
  dayEnd: string
): { start: string; end: string } | null {
  if (!overlaps(start, end, dayStart, dayEnd)) return null;
  return {
    start: new Date(
      Math.max(new Date(start).getTime(), new Date(dayStart).getTime())
    ).toISOString(),
    end: new Date(
      Math.min(new Date(end).getTime(), new Date(dayEnd).getTime())
    ).toISOString()
  };
}

function blockStyle(segment: TimedSegment): CSSProperties {
  const startMinutes = clamp(
    minutesFromMidnight(segment.start),
    GRID_START,
    GRID_END
  );
  let endMinutes = minutesFromMidnight(segment.end);
  if (endMinutes === 0) endMinutes = GRID_END;
  endMinutes = clamp(endMinutes, GRID_START, GRID_END);

  const top = ((startMinutes - GRID_START) / 60) * HOUR_HEIGHT;
  const height = Math.max(
    22,
    ((Math.max(endMinutes, startMinutes + 15) - startMinutes) / 60) * HOUR_HEIGHT
  );
  return { top, height };
}

function sortDue(a: Task, b: Task): number {
  return (
    (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
    b.importance - a.importance ||
    b.urgency - a.urgency
  );
}

export function CalendarView({
  tasks,
  threshold,
  selectedId,
  onSelect,
  onError
}: CalendarViewProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const calendarsQuery = useCalendars();
  const calendars = calendarsQuery.data ?? [];
  const refreshAll = useRefreshAllCalendars();

  const rangeStart = weekStart.toISOString();
  const rangeEnd = addDays(weekStart, 7).toISOString();
  const eventsQuery = useCalendarEvents(rangeStart, rangeEnd);
  const events = eventsQuery.data ?? [];

  const calendarsById = useMemo(
    () => new Map(calendars.map((calendar) => [calendar.id, calendar])),
    [calendars]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedEvent) {
        setSelectedEvent(null);
        return;
      }
      if (dialogOpen) setDialogOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedEvent, dialogOpen]);

  const todayKey = localDateKey(new Date());
  const weekStartKey = localDateKey(weekStart);

  const dayData = useMemo<DayData[]>(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      const key = localDateKey(date);
      const dayStart = date.toISOString();
      const dayEnd = addDays(date, 1).toISOString();
      const allDay: CalendarEvent[] = [];
      const timed: TimedSegment[] = [];

      for (const event of events) {
        if (!overlaps(event.start, event.end, dayStart, dayEnd)) continue;
        if (event.allDay) {
          allDay.push(event);
          continue;
        }
        const range = segmentRange(event.start, event.end, dayStart, dayEnd);
        if (!range) continue;
        timed.push({
          kind: "event",
          id: `event:${event.id}`,
          start: range.start,
          end: range.end,
          event,
          color: calendarsById.get(event.subscriptionId)?.color ?? "#4EA8FF"
        });
      }

      for (const task of tasks) {
        if (!task.scheduledStart || !task.scheduledEnd) continue;
        const range = segmentRange(
          task.scheduledStart,
          task.scheduledEnd,
          dayStart,
          dayEnd
        );
        if (!range) continue;
        const quadrant = quadrantOf(task, threshold);
        timed.push({
          kind: "task",
          id: `task:${task.id}`,
          start: range.start,
          end: range.end,
          task,
          qClass: quadrant === "pending" ? "pending" : `q${quadrant}`
        });
      }

      const due = tasks
        .filter((task) => task.dueDate === key)
        .sort(sortDue);

      return {
        date,
        key,
        allDay: allDay.sort((a, b) => a.title.localeCompare(b.title)),
        due,
        timed: layoutDayItems(timed)
      };
    });
  }, [weekStart, events, tasks, threshold, calendarsById]);

  const overdue = useMemo(
    () =>
      tasks
        .filter((task) => task.dueDate !== null && task.dueDate < weekStartKey)
        .sort(sortDue),
    [tasks, weekStartKey]
  );

  const dueGroups = dayData.filter((day) => day.due.length > 0);

  async function refreshNow() {
    try {
      await refreshAll.mutateAsync();
    } catch (caught) {
      onError(
        caught instanceof Error ? caught.message : "Could not refresh calendars"
      );
    }
  }

  const error = eventsQuery.error ?? calendarsQuery.error;

  return (
    <div className="calendar-view">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button
            className="cal-nav-btn"
            aria-label="Previous week"
            onClick={() => setWeekStart(addWeeks(weekStart, -1))}
          >
            ‹
          </button>
          <button
            className="small-btn"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
          >
            Today
          </button>
          <button
            className="cal-nav-btn"
            aria-label="Next week"
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
          >
            ›
          </button>
          <span className="cal-range">{weekLabel(weekStart)}</span>
        </div>

        <div className="cal-actions">
          {eventsQuery.isFetching && <span className="cal-sync">Syncing…</span>}
          <button className="small-btn" onClick={() => setDialogOpen(true)}>
            Calendars
          </button>
          <button
            className="small-btn"
            onClick={() => void refreshNow()}
            disabled={refreshAll.isPending}
          >
            {refreshAll.isPending ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="cal-error" role="status">
          {error instanceof Error ? error.message : "Could not load calendars"}
        </div>
      )}

      <div className="cal-body">
        <aside className="cal-due">
          <div className="cal-due-head">
            <h3>Due</h3>
            <span>This week</span>
          </div>
          <div className="cal-due-body">
            {overdue.length > 0 && (
              <div className="cal-due-group overdue">
                <h4>Overdue</h4>
                {overdue.map((task) => (
                  <DueTask
                    key={task.id}
                    task={task}
                    threshold={threshold}
                    selected={task.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            )}

            {dueGroups.map((day) => (
              <div className="cal-due-group" key={day.key}>
                <h4>
                  {day.date.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric"
                  })}
                </h4>
                {day.due.map((task) => (
                  <DueTask
                    key={task.id}
                    task={task}
                    threshold={threshold}
                    selected={task.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            ))}

            {overdue.length === 0 && dueGroups.length === 0 && (
              <p className="cal-due-empty">No due tasks this week.</p>
            )}
          </div>
        </aside>

        <div className="cal-main">
          <div className="cal-scroll">
            <div
              className="cal-grid"
              style={{ ["--hour-height" as string]: `${HOUR_HEIGHT}px` }}
            >
              <div className="cal-head-gutter" />
              {dayData.map((day) => (
                <div
                  className={`cal-day-head${
                    day.key === todayKey ? " today" : ""
                  }`}
                  key={`head-${day.key}`}
                >
                  <span>
                    {day.date.toLocaleDateString("en-US", {
                      weekday: "short"
                    })}
                  </span>
                  <strong>{day.date.getDate()}</strong>
                </div>
              ))}

              <div className="cal-allday-label">All-day</div>
              {dayData.map((day) => (
                <div className="cal-allday-cell" key={`allday-${day.key}`}>
                  {day.allDay.map((event) => (
                    <button
                      key={event.id}
                      className="cal-allday-event"
                      style={
                        {
                          ["--cal-color" as string]:
                            calendarsById.get(event.subscriptionId)?.color ??
                            "#4EA8FF"
                        } as CSSProperties
                      }
                      onClick={() => setSelectedEvent(event)}
                    >
                      {event.title}
                    </button>
                  ))}
                </div>
              ))}

              <div className="cal-time-axis" style={{ height: GRID_HEIGHT }}>
                {HOURS.map((hour) => (
                  <span
                    key={hour}
                    className={`cal-hour-label${hour === CALENDAR_END_HOUR ? " last" : ""}`}
                    style={{ top: (hour - CALENDAR_START_HOUR) * HOUR_HEIGHT }}
                  >
                    {formatHour(hour)}
                  </span>
                ))}
              </div>

              {dayData.map((day) => (
                <div
                  className={`cal-day-col${
                    day.key === todayKey ? " today" : ""
                  }`}
                  key={`col-${day.key}`}
                  style={{ height: GRID_HEIGHT }}
                >
                  {day.timed.map((positioned) => {
                    const segment = positioned.item;
                    const width = 100 / positioned.columns;
                    const style: CSSProperties = {
                      ...blockStyle(segment),
                      left: `${positioned.column * width}%`,
                      width: `calc(${width}% - 4px)`,
                      ["--cal-color" as string]:
                        segment.kind === "event"
                          ? segment.color
                          : "var(--q)"
                    };
                    const conflict = positioned.conflict ? " conflict" : "";
                    const compact =
                      (style.height as number) < 44 ? " compact" : "";

                    if (segment.kind === "task") {
                      return (
                        <button
                          key={segment.id}
                          className={`cal-block task ${segment.qClass}${conflict}${compact}${
                            segment.task.id === selectedId ? " selected" : ""
                          }`}
                          style={style}
                          onClick={() => onSelect(segment.task)}
                          title={`${segment.task.title} · ${formatTime(
                            segment.start
                          )}–${formatTime(segment.end)}`}
                        >
                          <span className="cal-block-time">
                            {formatTime(segment.start)}
                          </span>
                          <span className="cal-block-title">
                            {segment.task.title}
                          </span>
                          <span className="cal-block-due">
                            {segment.task.dueDate
                              ? dueLabel(segment.task.dueDate)
                              : ""}
                          </span>
                        </button>
                      );
                    }

                    return (
                      <button
                        key={segment.id}
                        className={`cal-block event${conflict}${compact}`}
                        style={style}
                        onClick={() => setSelectedEvent(segment.event)}
                        title={`${segment.event.title} · ${formatTime(
                          segment.start
                        )}–${formatTime(segment.end)}`}
                      >
                        <span className="cal-block-time">
                          {formatTime(segment.start)}
                        </span>
                        <span className="cal-block-title">
                          {segment.event.title}
                        </span>
                        {segment.event.location && (
                          <span className="cal-block-location">
                            {segment.event.location}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {dialogOpen && (
        <CalendarsDialog
          onClose={() => setDialogOpen(false)}
          onError={onError}
        />
      )}

      {selectedEvent && (
        <EventDialog
          event={selectedEvent}
          calendarName={
            calendarsById.get(selectedEvent.subscriptionId)?.name ?? "Calendar"
          }
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

function DueTask({
  task,
  threshold,
  selected,
  onSelect
}: {
  task: Task;
  threshold: number;
  selected: boolean;
  onSelect: (task: Task) => void;
}) {
  const quadrant = quadrantOf(task, threshold);
  const qClass = quadrant === "pending" ? "pending" : `q${quadrant}`;
  const state = dueState(task.dueDate);

  return (
    <button
      className={`cal-due-item ${qClass}${selected ? " selected" : ""}`}
      onClick={() => onSelect(task)}
    >
      <i aria-hidden="true" />
      <span className="cal-due-copy">
        <strong>{task.title}</strong>
        <span className={state === "overdue" ? "overdue" : ""}>
          {task.scheduledStart ? "Scheduled · " : ""}
          {task.dueDate ? dueLabel(task.dueDate) : ""}
        </span>
      </span>
    </button>
  );
}

function EventDialog({
  event,
  calendarName,
  onClose
}: {
  event: CalendarEvent;
  calendarName: string;
  onClose: () => void;
}) {
  const dateLabel = new Date(event.start).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
  const range = event.allDay
    ? "All day"
    : `${formatTime(event.start)} – ${formatTime(event.end)}`;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) onClose();
      }}
    >
      <div
        className="modal cal-event-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Calendar event"
      >
        <div className="modal-header">
          <div>
            <h2>{event.title}</h2>
            <p>
              {calendarName} · {dateLabel} · {range}
            </p>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="cal-event-details">
          {event.location && (
            <p>
              <strong>Location</strong>
              {event.location}
            </p>
          )}
          {event.notes && <p className="cal-event-notes">{event.notes}</p>}
          {event.url && (
            <a href={event.url} target="_blank" rel="noreferrer">
              Open event link
            </a>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
