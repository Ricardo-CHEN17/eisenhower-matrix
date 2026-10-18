import { isValidCalendarIcs, normalizeCalendarUrl } from "@eisenhower/shared";

const MAX_ICS_BYTES = 5_000_000;
const FETCH_TIMEOUT_MS = 15_000;

export async function fetchCalendarIcs(rawUrl: string): Promise<string> {
  const url = normalizeCalendarUrl(rawUrl);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Enter a valid calendar URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Calendar URLs must use http or https.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(parsed, {
      headers: {
        Accept: "text/calendar, text/plain, */*",
        "User-Agent": "EisenhowerMatrixCalendar/1.0"
      },
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Calendar server returned ${response.status}.`);
    }

    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_ICS_BYTES) {
      throw new Error("This calendar file is too large.");
    }

    const text = await response.text();
    if (text.length > MAX_ICS_BYTES) {
      throw new Error("This calendar file is too large.");
    }
    if (!isValidCalendarIcs(text)) {
      throw new Error("The URL did not return a valid iCalendar (.ics) feed.");
    }

    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timed out while downloading the calendar.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
