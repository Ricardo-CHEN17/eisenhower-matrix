export const CALENDAR_START_HOUR = 7;
export const CALENDAR_END_HOUR = 24;
export const HOUR_HEIGHT = 56;

export function startOfWeek(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateKeyFromIso(iso: string): string {
  return localDateKey(new Date(iso));
}

export function timeFromIso(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

export function combineLocal(dateKey: string, time: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year!, month! - 1, day!, hours!, minutes!, 0, 0).toISOString();
}

export function addHoursIso(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

export function formatTime(iso: string): string {
  return timeFromIso(iso);
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function weekLabel(start: Date): string {
  const end = addDays(start, 6);
  const startLabel = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
  const endLabel = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  return `${startLabel} – ${endLabel}`;
}

export function localDayRange(iso: string): { start: string; end: string } {
  const date = new Date(iso);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return (
    new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(aEnd).getTime() > new Date(bStart).getTime()
  );
}

export function minutesFromMidnight(iso: string): number {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}

export interface PositionedItem<T> {
  item: T;
  column: number;
  columns: number;
  conflict: boolean;
}

/**
 * Assign side-by-side columns to overlapping items in a day column.
 */
export function layoutDayItems<T extends { start: string; end: string }>(
  items: T[]
): PositionedItem<T>[] {
  const sorted = [...items].sort(
    (a, b) =>
      new Date(a.start).getTime() - new Date(b.start).getTime() ||
      new Date(a.end).getTime() - new Date(b.end).getTime()
  );

  const result: PositionedItem<T>[] = [];
  let cluster: T[] = [];
  let clusterEnd = 0;

  const flush = () => {
    if (cluster.length === 0) return;
    const columnEnds: number[] = [];
    const placed: Array<{ item: T; column: number }> = [];

    for (const item of cluster) {
      const start = new Date(item.start).getTime();
      const end = new Date(item.end).getTime();
      let column = columnEnds.findIndex((value) => value <= start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(end);
      } else {
        columnEnds[column] = end;
      }
      placed.push({ item, column });
    }

    const columns = Math.max(1, columnEnds.length);
    const conflict = cluster.length > 1;
    for (const entry of placed) {
      result.push({ ...entry, columns, conflict });
    }
    cluster = [];
    clusterEnd = 0;
  };

  for (const item of sorted) {
    const start = new Date(item.start).getTime();
    const end = new Date(item.end).getTime();
    if (cluster.length > 0 && start >= clusterEnd) {
      flush();
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();

  return result;
}
