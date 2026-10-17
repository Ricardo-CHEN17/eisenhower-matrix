import { useEffect, useRef, useState } from "react";
import {
  QUADRANTS,
  clampScore,
  dueLabel,
  dueState,
  quadrantOf,
  type Tag,
  type Task
} from "@eisenhower/shared";
import type { UpdateTaskInput } from "../api";

interface TaskDrawerProps {
  task: Task;
  tags: Tag[];
  threshold: number;
  onClose: () => void;
  onPreview: (patch: UpdateTaskInput) => void;
  onSave: (patch: UpdateTaskInput) => void;
  onComplete: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onCreateTag: (name: string) => Promise<Tag | undefined>;
}

export function TaskDrawer({
  task,
  tags,
  threshold,
  onClose,
  onPreview,
  onSave,
  onComplete,
  onArchive,
  onDelete,
  onCreateTag
}: TaskDrawerProps) {
  const [titleText, setTitleText] = useState(task.title);
  const [impText, setImpText] = useState(String(task.importance));
  const [urgText, setUrgText] = useState(String(task.urgency));
  const [tagName, setTagName] = useState("");
  const [tagError, setTagError] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);

  const pendingRef = useRef<UpdateTaskInput>({});
  const timerRef = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const flush = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(pending).length > 0) onSaveRef.current(pending);
  };

  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    setTitleText(task.title);
    setImpText(String(task.importance));
    setUrgText(String(task.urgency));
  }, [task.id, task.title, task.importance, task.urgency]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      flushRef.current();
    };
  }, []);

  const queue = (patch: UpdateTaskInput, immediate = false) => {
    onPreview(patch);
    pendingRef.current = { ...pendingRef.current, ...patch };

    if (immediate) {
      flush();
      return;
    }

    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = {};
      if (Object.keys(pending).length > 0) onSaveRef.current(pending);
    }, 320);
  };

  const commitTitle = () => {
    const next = titleText.trim();
    if (!next) {
      setTitleText(task.title);
      return;
    }
    if (next !== task.title) queue({ title: next }, true);
  };

  const commitScore = (kind: "importance" | "urgency") => {
    const raw = kind === "importance" ? impText : urgText;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      if (kind === "importance") setImpText(String(task.importance));
      else setUrgText(String(task.urgency));
      return;
    }
    const next = clampScore(parsed);
    if (kind === "importance") setImpText(String(next));
    else setUrgText(String(next));
    if (next !== task[kind]) {
      queue(
        kind === "importance"
          ? { importance: next }
          : { urgency: next },
        true
      );
    }
  };

  const toggleTag = (tagId: string) => {
    const ids = task.tags.map((tag) => tag.id);
    const next = ids.includes(tagId)
      ? ids.filter((id) => id !== tagId)
      : [...ids, tagId];
    queue({ tagIds: next }, true);
  };

  const addTag = async () => {
    const name = tagName.trim();
    if (!name || creatingTag) return;
    setCreatingTag(true);
    setTagError("");
    try {
      const tag = await onCreateTag(name);
      if (tag) {
        const ids = task.tags.map((item) => item.id);
        queue({ tagIds: [...ids, tag.id] }, true);
        setTagName("");
      }
    } catch (error) {
      setTagError(error instanceof Error ? error.message : "Could not create tag");
    } finally {
      setCreatingTag(false);
    }
  };

  const quadrant = quadrantOf(task, threshold);
  const pending = quadrant === "pending";
  const badgeName = pending
    ? "Pending review"
    : QUADRANTS[quadrant as 1 | 2 | 3 | 4].name;
  const visibility = pending
    ? "Pending review"
    : quadrant === 1 || quadrant === 2
      ? "Independent card"
      : "Not important";
  const due = task.dueDate ? dueLabel(task.dueDate) : "";
  const dueClass =
    task.dueDate && dueState(task.dueDate) === "overdue"
      ? "overdue"
      : task.dueDate && ["today", "soon"].includes(dueState(task.dueDate))
        ? "soon"
        : "";
  const otherTags = tags.filter(
    (tag) => !task.tags.some((assigned) => assigned.id === tag.id)
  );

  return (
    <aside className="drawer" aria-label="Task details">
      <div className="drawer-header">
        <input
          className="drawer-title-input"
          value={titleText}
          onChange={(event) => setTitleText(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          aria-label="Task title"
        />
        <button
          className="drawer-close"
          onClick={onClose}
          aria-label="Close details"
        >
          ×
        </button>
      </div>

      <div className="drawer-meta">
        <span className={`badge ${pending ? "pending" : `q${quadrant}`}`}>
          {badgeName}
        </span>
        {due && <span className={`due ${dueClass}`}>{due}</span>}
        <span className="hint" style={{ marginTop: 0 }}>
          {visibility}
        </span>
      </div>

      <div className="detail-section">
        <label htmlFor="drawer-importance">
          Importance <output>{task.importance}</output>
        </label>
        <div className="score-row">
          <input
            id="drawer-importance"
            type="range"
            min={0}
            max={100}
            step={1}
            value={task.importance}
            onChange={(event) =>
              queue({ importance: Number(event.target.value) })
            }
          />
          <input
            className="number-input"
            type="number"
            min={0}
            max={100}
            step={1}
            value={impText}
            onChange={(event) => setImpText(event.target.value)}
            onBlur={() => commitScore("importance")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitScore("importance");
                event.currentTarget.blur();
              }
            }}
          />
        </div>
      </div>

      <div className="detail-section">
        <label htmlFor="drawer-urgency">
          Urgency <output>{task.urgency}</output>
        </label>
        <div className="score-row">
          <input
            id="drawer-urgency"
            type="range"
            min={0}
            max={100}
            step={1}
            value={task.urgency}
            onChange={(event) => queue({ urgency: Number(event.target.value) })}
          />
          <input
            className="number-input"
            type="number"
            min={0}
            max={100}
            step={1}
            value={urgText}
            onChange={(event) => setUrgText(event.target.value)}
            onBlur={() => commitScore("urgency")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitScore("urgency");
                event.currentTarget.blur();
              }
            }}
          />
        </div>
      </div>

      <div className="detail-section">
        <label htmlFor="drawer-due">Due date</label>
        <input
          id="drawer-due"
          className="date-input"
          type="date"
          value={task.dueDate ?? ""}
          onChange={(event) =>
            queue({ dueDate: event.target.value || null }, true)
          }
        />
      </div>

      <div className="detail-section">
        <label>Tags</label>
        <div className="tag-list">
          {task.tags.map((tag) => (
            <span className="tag active" key={tag.id}>
              <i style={{ background: tag.color }} />
              {tag.name}
              <button
                onClick={() => toggleTag(tag.id)}
                aria-label={`Remove ${tag.name}`}
              >
                ×
              </button>
            </span>
          ))}
          {otherTags.map((tag) => (
            <button
              className="tag"
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              title={`Add ${tag.name}`}
            >
              <i style={{ background: tag.color }} />
              {tag.name}
            </button>
          ))}
          {!task.tags.length && !otherTags.length && (
            <span className="hint" style={{ marginTop: 0 }}>
              No tags yet
            </span>
          )}
        </div>
        <div className="tag-add">
          <input
            className="text-input"
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addTag();
              }
            }}
            placeholder="New tag…"
            maxLength={30}
            aria-label="New tag name"
          />
          <button
            className="small-btn"
            onClick={() => void addTag()}
            disabled={creatingTag}
          >
            {creatingTag ? "Adding…" : "Add"}
          </button>
        </div>
        {tagError && <p className="hint form-error">{tagError}</p>}
      </div>

      <div className="detail-section">
        <label htmlFor="drawer-notes">Notes</label>
        <textarea
          id="drawer-notes"
          value={task.notes}
          onChange={(event) => queue({ notes: event.target.value })}
          placeholder="Add context…"
        />
      </div>

      <div className="detail-actions">
        <button
          className="btn primary"
          onClick={() => {
            flush();
            onComplete();
          }}
        >
          ✓ Complete
        </button>
        <button
          className="btn"
          onClick={() => {
            flush();
            onArchive();
          }}
        >
          Archive
        </button>
        <button
          className="btn danger"
          onClick={() => {
            flush();
            onDelete();
          }}
        >
          Delete
        </button>
      </div>

      <p className="hint">
        Use the sliders or type a number. Arrow keys on a focused card also
        nudge importance and urgency.
      </p>
    </aside>
  );
}
