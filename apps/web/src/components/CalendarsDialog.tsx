import { useState, type ChangeEvent } from "react";
import { isStaticDataMode } from "../api";
import {
  useCalendars,
  useCreateCalendar,
  useDeleteCalendar,
  useImportCalendar,
  useRefreshAllCalendars,
  useRefreshCalendar
} from "../hooks";

interface CalendarsDialogProps {
  onClose: () => void;
  onError: (message: string) => void;
}

type AddMode = "url" | "file";

const PROXY_STORAGE_KEY = "eisenhower.calendarProxyUrl";

function formatSync(iso: string | null): string {
  if (!iso) return "Never synced";
  return `Synced ${new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

export function CalendarsDialog({ onClose, onError }: CalendarsDialogProps) {
  const calendarsQuery = useCalendars();
  const calendars = calendarsQuery.data ?? [];
  const createCalendar = useCreateCalendar();
  const importCalendar = useImportCalendar();
  const deleteCalendar = useDeleteCalendar();
  const refreshCalendar = useRefreshCalendar();
  const refreshAll = useRefreshAllCalendars();

  const [mode, setMode] = useState<AddMode>("url");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [proxyUrl, setProxyUrl] = useState(() => {
    try {
      return (
        window.localStorage.getItem(PROXY_STORAGE_KEY) ??
        import.meta.env.VITE_CALENDAR_PROXY_URL ??
        ""
      );
    } catch {
      return import.meta.env.VITE_CALENDAR_PROXY_URL ?? "";
    }
  });
  const [ics, setIcs] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setIcs("");
      setFileName("");
      return;
    }
    if (file.size > 5_000_000) {
      setError("This calendar file is too large (max 5 MB).");
      setIcs("");
      setFileName("");
      return;
    }
    try {
      const text = await file.text();
      setIcs(text);
      setFileName(file.name);
      setError("");
      if (!name) setName(file.name.replace(/\.ics$/i, ""));
    } catch {
      setError("Could not read this file.");
    }
  }

  async function submit() {
    const nextName = name.trim();
    if (!nextName) {
      setError("Give this calendar a name first.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (mode === "url") {
        if (!url.trim()) {
          setError("Paste a calendar subscription URL.");
          return;
        }
        if (!isStaticDataMode && !proxyUrl.trim()) {
          setError(
            "URL subscriptions on GitHub Pages need a calendar proxy URL. Paste the URL of your deployed proxy, or upload an .ics file."
          );
          return;
        }
        await createCalendar.mutateAsync({
          name: nextName,
          url: url.trim(),
          proxyUrl: isStaticDataMode ? proxyUrl.trim() : undefined
        });
        if (isStaticDataMode) {
          try {
            window.localStorage.setItem(PROXY_STORAGE_KEY, proxyUrl.trim());
          } catch {
            // Ignore storage failures.
          }
        }
        setUrl("");
      } else {
        if (!ics) {
          setError("Choose an .ics file first.");
          return;
        }
        await importCalendar.mutateAsync({ name: nextName, ics });
        setIcs("");
        setFileName("");
      }
      setName("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not add calendar"
      );
    } finally {
      setBusy(false);
    }
  }

  function remove(id: string) {
    deleteCalendar.mutate(id, {
      onError: (caught) =>
        onError(caught instanceof Error ? caught.message : "Could not delete calendar")
    });
  }

  async function refreshAllNow() {
    try {
      await refreshAll.mutateAsync();
    } catch (caught) {
      onError(
        caught instanceof Error ? caught.message : "Could not refresh calendars"
      );
    }
  }

  async function refreshOne(id: string) {
    try {
      const calendar = await refreshCalendar.mutateAsync(id);
      if (calendar.lastError) onError(calendar.lastError);
    } catch (caught) {
      onError(
        caught instanceof Error ? caught.message : "Could not refresh calendar"
      );
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal cal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Calendars"
      >
        <div className="modal-header">
          <div>
            <h2>Calendars</h2>
            <p>
              External calendars are read-only. Subscribe to a URL or upload an
              exported .ics file.
            </p>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="cal-dialog-list">
          <div className="cal-dialog-list-head">
            <span>{calendars.length} calendar{calendars.length === 1 ? "" : "s"}</span>
            {calendars.some((calendar) => calendar.sourceType === "url") && (
              <button
                className="small-btn"
                onClick={() => void refreshAllNow()}
                disabled={refreshAll.isPending}
              >
                {refreshAll.isPending ? "Refreshing…" : "Refresh all"}
              </button>
            )}
          </div>

          {calendars.length === 0 ? (
            <p className="hint">No calendars yet.</p>
          ) : (
            calendars.map((calendar) => (
              <div className="cal-sub" key={calendar.id}>
                <i style={{ background: calendar.color }} aria-hidden="true" />
                <div className="cal-sub-copy">
                  <strong>{calendar.name}</strong>
                  <span>
                    {calendar.sourceType === "url"
                      ? calendar.url
                      : "Uploaded .ics file"}
                  </span>
                  {calendar.lastError ? (
                    <span className="cal-sub-error">{calendar.lastError}</span>
                  ) : (
                    <span className="cal-sub-sync">
                      {formatSync(calendar.lastFetchedAt)}
                    </span>
                  )}
                </div>
                {calendar.sourceType === "url" && (
                  <button
                    className="small-btn"
                    onClick={() => void refreshOne(calendar.id)}
                    disabled={refreshCalendar.isPending}
                  >
                    Refresh
                  </button>
                )}
                <button
                  className="cal-sub-delete"
                  onClick={() => remove(calendar.id)}
                  aria-label={`Delete ${calendar.name}`}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>

        <div className="cal-dialog-add">
          <div className="cal-add-tabs" role="tablist" aria-label="Add calendar">
            <button
              className={mode === "url" ? "active" : ""}
              role="tab"
              aria-selected={mode === "url"}
              onClick={() => {
                setMode("url");
                setError("");
              }}
            >
              Subscribe to URL
            </button>
            <button
              className={mode === "file" ? "active" : ""}
              role="tab"
              aria-selected={mode === "file"}
              onClick={() => {
                setMode("file");
                setError("");
              }}
            >
              Upload .ics
            </button>
          </div>

          <div className="field">
            <label htmlFor="cal-name">Name</label>
            <input
              id="cal-name"
              className="text-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Work, Personal…"
              maxLength={60}
            />
          </div>

          {mode === "url" ? (
            <>
              <div className="field">
                <label htmlFor="cal-url">Calendar URL</label>
                <input
                  id="cal-url"
                  className="text-input"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="webcal://… or https://…"
                  spellCheck={false}
                />
                <p className="hint">
                  For iCloud, publish the calendar and use the public link —
                  private calendars are not supported.
                </p>
              </div>

              {isStaticDataMode && (
                <div className="field">
                  <label htmlFor="cal-proxy">Proxy URL</label>
                  <input
                    id="cal-proxy"
                    className="text-input"
                    value={proxyUrl}
                    onChange={(event) => setProxyUrl(event.target.value)}
                    placeholder="https://your-calendar-proxy.workers.dev/"
                    spellCheck={false}
                  />
                  <p className="hint">
                    GitHub Pages cannot fetch calendar URLs directly. Deploy the
                    Cloudflare Worker in <code>workers/calendar-proxy</code> and
                    paste its URL here.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="field">
              <label htmlFor="cal-file">.ics file</label>
              <input
                id="cal-file"
                className="text-input cal-file-input"
                type="file"
                accept=".ics,text/calendar"
                onChange={(event) => void readFile(event)}
              />
              {fileName && <p className="hint">{fileName}</p>}
            </div>
          )}

          {error && <p className="hint form-error">{error}</p>}

          <div className="modal-actions">
            <button className="btn" onClick={onClose}>
              Close
            </button>
            <button
              className="btn primary"
              onClick={() => void submit()}
              disabled={busy || createCalendar.isPending || importCalendar.isPending}
            >
              {busy || createCalendar.isPending || importCalendar.isPending
                ? "Adding…"
                : "Add calendar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
