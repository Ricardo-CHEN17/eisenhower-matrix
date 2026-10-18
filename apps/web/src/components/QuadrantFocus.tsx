import { useMemo } from "react";
import {
  QUADRANTS,
  dueLabel,
  dueState,
  type KnownQuadrant,
  type Task
} from "@eisenhower/shared";
import { Matrix } from "./Matrix";

export type QuadrantViewMode = "list" | "map";

interface QuadrantFocusProps {
  quadrant: KnownQuadrant;
  tasks: Task[];
  threshold: number;
  selectedId: string | null;
  isFiltering: boolean;
  mode: QuadrantViewMode;
  onModeChange: (mode: QuadrantViewMode) => void;
  onSelect: (task: Task) => void;
  onComplete: (task: Task) => void;
  onNudge: (task: Task, patch: { importance?: number; urgency?: number }) => void;
  onExit: () => void;
}

export function QuadrantFocus({
  quadrant,
  tasks,
  threshold,
  selectedId,
  isFiltering,
  mode,
  onModeChange,
  onSelect,
  onComplete,
  onNudge,
  onExit
}: QuadrantFocusProps) {
  const meta = QUADRANTS[quadrant];
  const overdue = tasks.filter(
    (task) => dueState(task.dueDate) === "overdue"
  ).length;

  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        if (a.dueDate && b.dueDate) {
          const byDue = a.dueDate.localeCompare(b.dueDate);
          if (byDue !== 0) return byDue;
        } else if (a.dueDate) {
          return -1;
        } else if (b.dueDate) {
          return 1;
        }
        return (
          b.importance - a.importance ||
          b.urgency - a.urgency ||
          a.id.localeCompare(b.id)
        );
      }),
    [tasks]
  );

  const emptyMessage = isFiltering ? "No matches" : `Nothing in ${meta.name}`;
  const emptyHint = isFiltering
    ? "Try another search or clear the filters."
    : "Move a task here by adjusting its importance or urgency.";

  return (
    <section
      className={`quadrant-focus q${quadrant}${
        mode === "map" ? " map-mode" : ""
      }`}
      aria-labelledby="qfocus-title"
    >
      <header className="qfocus-header">
        <div className="qfocus-heading">
          <span className="qfocus-accent" aria-hidden="true" />
          <div>
            <div className="qfocus-title-row">
              <h2 id="qfocus-title">{meta.name}</h2>
              <span className="quad-count">{tasks.length}</span>
              {overdue > 0 && (
                <span className="due overdue qfocus-overdue">
                  {overdue} overdue
                </span>
              )}
            </div>
            <p>{meta.hint}</p>
          </div>
        </div>

        <div className="qfocus-actions">
          <div
            className="qfocus-view-toggle"
            role="group"
            aria-label="Display mode"
          >
            <button
              className={mode === "list" ? "active" : ""}
              aria-pressed={mode === "list"}
              onClick={() => onModeChange("list")}
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M2.5 4h11M2.5 8h11M2.5 12h7" strokeLinecap="round" />
              </svg>
              List
            </button>
            <button
              className={mode === "map" ? "active" : ""}
              aria-pressed={mode === "map"}
              onClick={() => onModeChange("map")}
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                aria-hidden="true"
              >
                <rect x="2" y="2" width="5" height="5" rx="1" />
                <rect x="9" y="2" width="5" height="5" rx="1" />
                <rect x="2" y="9" width="5" height="5" rx="1" />
                <rect x="9" y="9" width="5" height="5" rx="1" />
              </svg>
              Map
            </button>
          </div>

          <button className="qfocus-back" onClick={onExit}>
            ← All quadrants
          </button>
        </div>
      </header>

      {mode === "map" ? (
        <div className="qfocus-map">
          <Matrix
            tasks={tasks}
            threshold={threshold}
            selectedId={selectedId}
            forceIndividual={false}
            focusQuadrant={quadrant}
            onSelect={onSelect}
            onComplete={onComplete}
            onNudge={onNudge}
            onFocusQuadrant={() => undefined}
            emptyMessage={emptyMessage}
            emptyHint={emptyHint}
          />
        </div>
      ) : sorted.length === 0 ? (
        <div className="qfocus-empty">
          <strong>{emptyMessage}</strong>
          <span>{emptyHint}</span>
        </div>
      ) : (
        <div className="qfocus-grid">
          {sorted.map((task) => (
            <FocusCard
              key={task.id}
              task={task}
              quadrant={quadrant}
              selected={task.id === selectedId}
              onSelect={onSelect}
              onComplete={onComplete}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FocusCard({
  task,
  quadrant,
  selected,
  onSelect,
  onComplete
}: {
  task: Task;
  quadrant: KnownQuadrant;
  selected: boolean;
  onSelect: (task: Task) => void;
  onComplete: (task: Task) => void;
}) {
  const state = task.dueDate ? dueState(task.dueDate) : "none";
  const dueClass =
    state === "overdue"
      ? "overdue"
      : state === "today" || state === "soon"
        ? "soon"
        : "";

  return (
    <article
      className={`qfocus-card q${quadrant}${selected ? " selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${task.title}, importance ${task.importance}, urgency ${task.urgency}`}
      onClick={() => onSelect(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(task);
        }
      }}
    >
      <div className="qfocus-card-top">
        <h3>{task.title}</h3>
        <button
          className="complete-btn"
          title="Complete"
          aria-label="Complete"
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onComplete(task);
          }}
        >
          ✓
        </button>
      </div>

      {task.notes && <p className="qfocus-notes">{task.notes}</p>}

      <div className="qfocus-meta">
        {task.dueDate && (
          <span className={`due ${dueClass}`}>{dueLabel(task.dueDate)}</span>
        )}
        {task.tags.map((tag) => (
          <span className="qfocus-tag" key={tag.id}>
            <i style={{ background: tag.color }} />
            {tag.name}
          </span>
        ))}
        <span className="qfocus-score">
          I {task.importance} · U {task.urgency}
        </span>
      </div>
    </article>
  );
}
