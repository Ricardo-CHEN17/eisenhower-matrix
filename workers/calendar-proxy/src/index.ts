interface Env {
  ALLOWED_ORIGINS: string;
}

const MAX_BYTES = 5_000_000;
const TIMEOUT_MS = 15_000;

function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin"
  };
}

function json(
  body: unknown,
  status: number,
  origin: string
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function allowedOrigin(request: Request, env: Env): string {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowed.includes("*")) return "*";
  return allowed.includes(origin) ? origin : "";
}

function normalizeCalendarUrl(raw: string): string {
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

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return true;
  }

  if (host.includes(":")) {
    if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
    if (
      host.startsWith("fe80:") ||
      host.startsWith("fc") ||
      host.startsWith("fd")
    ) {
      return true;
    }
  }

  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;

  const first = Number(match[1]);
  const second = Number(match[2]);

  if (first === 0 || first === 10 || first === 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  if (first >= 224) return true;

  return false;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin || "*") });
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405, origin || "*");
    }

    if (!origin) {
      return json({ error: "Origin not allowed" }, 403, "*");
    }

    const raw = new URL(request.url).searchParams.get("url");
    if (!raw) {
      return json({ error: "Missing url parameter" }, 400, origin);
    }

    let target: URL;
    try {
      target = new URL(normalizeCalendarUrl(raw));
    } catch {
      return json({ error: "Invalid calendar URL" }, 400, origin);
    }

    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return json({ error: "Only http and https URLs are supported" }, 400, origin);
    }
    if (target.username || target.password) {
      return json({ error: "URLs with credentials are not supported" }, 400, origin);
    }
    if (isBlockedHost(target.hostname)) {
      return json({ error: "That host is not allowed" }, 400, origin);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const upstream = await fetch(target.toString(), {
        headers: {
          Accept: "text/calendar, text/plain, */*",
          "User-Agent": "EisenhowerMatrixCalendarProxy/1.0"
        },
        redirect: "follow",
        signal: controller.signal
      });

      if (!upstream.ok) {
        return json(
          { error: `Calendar server returned ${upstream.status}` },
          502,
          origin
        );
      }

      const text = await upstream.text();
      if (text.length > MAX_BYTES) {
        return json({ error: "Calendar file is too large" }, 413, origin);
      }
      if (!text.toUpperCase().includes("BEGIN:VCALENDAR")) {
        return json(
          { error: "The URL did not return an iCalendar feed" },
          422,
          origin
        );
      }

      return new Response(text, {
        status: 200,
        headers: {
          ...corsHeaders(origin),
          "content-type": "text/calendar; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Timed out while downloading the calendar"
          : "Could not fetch the calendar";
      return json({ error: message }, 502, origin);
    } finally {
      clearTimeout(timer);
    }
  }
};
