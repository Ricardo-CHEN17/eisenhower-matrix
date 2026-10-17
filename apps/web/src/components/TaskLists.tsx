import type { Task } from "@eisenhower/shared";

interface TaskListsProps {
  view: "completed" | "archived";
  tasks: Task[];
  onRestore: (task: Task) => void;
  onArchive: (task: Task) => void;
  onDelete: (task: Task) => void;
}

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function TaskLists({
  view,
  tasks,
  onRestore,
  onArchive,
  onDelete
}: TaskListsProps) {
  const title = view === "completed" ? "Completed" : "Archived";
  const description =
    view === "completed"
      ? "Finished tasks stay here until you archive them."
      : "Archived tasks are hidden from the active matrix.";

  return (
    <section className="list-view">
      <div className="list-inner">
        <div className="list-heading">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <p>{tasks.length} tasks</p>
        </div>

        {!tasks.length && (
          <div className="empty-state">
            <h2>Nothing here</h2>
            <p>
              {view === "completed"
                ? "Complete a task and it will show up here."
                : "Archive a task and it will show up here."}
            </p>
          </div>
        )}

        {tasks.map((task) => {
          const date =
            view === "completed" ? task.completedAt : task.archivedAt;
          return (
            <article className="task-row" key={task.id}>
              <div className="row-main">
                <h3 className="row-title">{task.title}</h3>
                <div className="row-meta">
                  <span>
                    I {task.importance} · U {task.urgency}
                  </span>
                  {task.tags.length > 0 && (
                    <span className="row-tags">
                      {task.tags.map((tag) => (
                        <span className="row-tag" key={tag.id}>
                          <i style={{ background: tag.color }} />
                          {tag.name}
                        </span>
                      ))}
                    </span>
                  )}
                  {view === "archived" && (
                    <span>
                      {task.status === "completed" ? "Completed" : "Active"}
                    </span>
                  )}
                </div>
              </div>

              <span className="row-date">
                {view === "completed" ? "Completed " : "Archived "}
                {formatDate(date)}
              </span>

              <div className="row-actions">
                <button
                  className="small-btn"
                  onClick={() => onRestore(task)}
                >
                  Restore
                </button>
                {view === "completed" && (
                  <button
                    className="small-btn"
                    onClick={() => onArchive(task)}
                  >
                    Archive
                  </button>
                )}
                <button
                  className="small-btn"
                  onClick={() => onDelete(task)}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
