import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  DEFAULT_SETTINGS,
  quadrantOf,
  type Settings,
  type Tag,
  type Task,
  type TaskView
} from "@eisenhower/shared";
import { Matrix } from "./components/Matrix";
import {
  AddTaskModal,
  ConfirmDialog,
  SettingsDialog
} from "./components/Modals";
import { TaskDrawer } from "./components/TaskDrawer";
import { TaskLists } from "./components/TaskLists";
import {
  useCreateTag,
  useCreateTask,
  useDeleteTag,
  useDeleteTask,
  useSettings,
  useTags,
  useTaskPreview,
  useTasks,
  useUpdateSettings,
  useUpdateTask
} from "./hooks";

interface ToastState {
  message: string;
  undo?: () => void;
}

export default function App() {
  const [view, setView] = useState<TaskView>("active");
  const [search, setSearch] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);

  const activeQuery = useTasks("active");
  const completedQuery = useTasks("completed");
  const archivedQuery = useTasks("archived");
  const tagsQuery = useTags();
  const settingsQuery = useSettings();

  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
  const createTag = useCreateTag();
  const deleteTag = useDeleteTag();
  const updateSettings = useUpdateSettings();
  const previewTask = useTaskPreview();

  const settings: Settings = settingsQuery.data ?? DEFAULT_SETTINGS;
  const tags = tagsQuery.data ?? [];

  const tasks =
    view === "active"
      ? activeQuery.data ?? []
      : view === "completed"
        ? completedQuery.data ?? []
        : archivedQuery.data ?? [];

  const counts = {
    active: activeQuery.data?.length ?? 0,
    completed: completedQuery.data?.length ?? 0,
    archived: archivedQuery.data?.length ?? 0
  };

  const isFiltering =
    search.trim().length > 0 || selectedTagIds.length > 0;

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tasks.filter((task) => {
      if (query) {
        const matches =
          task.title.toLowerCase().includes(query) ||
          task.notes.toLowerCase().includes(query);
        if (!matches) return false;
      }

      if (
        selectedTagIds.length > 0 &&
        !task.tags.some((tag) => selectedTagIds.includes(tag.id))
      ) {
        return false;
      }

      return true;
    });
  }, [tasks, search, selectedTagIds]);

  const pendingCount = useMemo(
    () =>
      view === "active"
        ? filteredTasks.filter(
            (task) => quadrantOf(task, settings.threshold) === "pending"
          ).length
        : 0,
    [filteredTasks, settings.threshold, view]
  );

  const selectedTask =
    view === "active"
      ? activeQuery.data?.find((task) => task.id === selectedId) ?? null
      : null;

  useEffect(() => {
    document.body.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    if (selectedId && !activeQuery.data?.some((task) => task.id === selectedId)) {
      setSelectedId(null);
    }
  }, [activeQuery.data, selectedId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        target.matches("input, textarea, select, [contenteditable='true']");

      if (event.key === "Escape") {
        setAddOpen(false);
        setSettingsOpen(false);
        setDeleteTarget(null);
        setSelectedId(null);
        return;
      }

      if (typing || document.querySelector(".modal-backdrop")) return;

      if (event.key === "n") {
        event.preventDefault();
        setAddOpen(true);
      } else if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
      }
    };
  }, []);

  function showToast(message: string, undo?: () => void) {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToast(null);
    }, 5000);
  }

  function runUndo() {
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    const action = toast?.undo;
    setToast(null);
    action?.();
  }

  function changeView(next: TaskView) {
    setView(next);
    setSelectedId(null);
  }

  function pushError(error: unknown) {
    showToast(error instanceof Error ? error.message : "Something went wrong");
  }

  function handleSelect(task: Task) {
    setSelectedId(task.id);
  }

  function handlePreview(id: string, patch: Parameters<typeof previewTask>[1]) {
    previewTask(id, patch);
  }

  function handleSave(id: string, patch: Parameters<typeof previewTask>[1]) {
    updateTask.mutate(
      { id, patch },
      { onError: (error) => pushError(error) }
    );
  }

  function handleNudge(
    task: Task,
    patch: { importance?: number; urgency?: number }
  ) {
    updateTask.mutate(
      { id: task.id, patch },
      { onError: (error) => pushError(error) }
    );
  }

  function handleComplete(task: Task) {
    setSelectedId(null);
    updateTask.mutate(
      { id: task.id, patch: { status: "completed" } },
      { onError: (error) => pushError(error) }
    );
    showToast(`Completed “${task.title}”`, () => {
      updateTask.mutate(
        { id: task.id, patch: { status: "active" } },
        { onError: (error) => pushError(error) }
      );
    });
  }

  function handleArchive(task: Task) {
    setSelectedId(null);
    updateTask.mutate(
      { id: task.id, patch: { archived: true } },
      { onError: (error) => pushError(error) }
    );
    showToast(`Archived “${task.title}”`, () => {
      updateTask.mutate(
        { id: task.id, patch: { archived: false } },
        { onError: (error) => pushError(error) }
      );
    });
  }

  function requestDelete(task: Task) {
    setDeleteTarget(task);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const task = deleteTarget;
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        setSelectedId(null);
        showToast(`Deleted “${task.title}”`);
      },
      onError: (error) => {
        setDeleteTarget(null);
        pushError(error);
      }
    });
  }

  function handleRestore(task: Task) {
    if (view === "archived") {
      updateTask.mutate(
        { id: task.id, patch: { archived: false } },
        { onError: (error) => pushError(error) }
      );
      showToast(`Restored “${task.title}”`, () => {
        updateTask.mutate(
          { id: task.id, patch: { archived: true } },
          { onError: (error) => pushError(error) }
        );
      });
    } else {
      updateTask.mutate(
        { id: task.id, patch: { status: "active" } },
        { onError: (error) => pushError(error) }
      );
      showToast(`Restored “${task.title}”`, () => {
        updateTask.mutate(
          { id: task.id, patch: { status: "completed" } },
          { onError: (error) => pushError(error) }
        );
      });
    }
  }

  function handleArchiveFromList(task: Task) {
    updateTask.mutate(
      { id: task.id, patch: { archived: true } },
      { onError: (error) => pushError(error) }
    );
    showToast(`Archived “${task.title}”`, () => {
      updateTask.mutate(
        { id: task.id, patch: { archived: false } },
        { onError: (error) => pushError(error) }
      );
    });
  }

  function handleToggleTag(tagId: string) {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId]
    );
  }

  function clearFilters() {
    setSearch("");
    setSelectedTagIds([]);
  }

  async function handleCreateTask(input: {
    title: string;
    dueDate: string | null;
  }) {
    const task = await createTask.mutateAsync({
      title: input.title,
      dueDate: input.dueDate
    });
    setView("active");
    setSearch("");
    setSelectedTagIds([]);
    setSelectedId(task.id);
  }

  async function handleCreateTag(name: string): Promise<Tag | undefined> {
    try {
      return await createTag.mutateAsync(name);
    } catch (error) {
      pushError(error);
      return undefined;
    }
  }

  function handleDeleteTag(tag: Tag) {
    setSelectedTagIds((current) => current.filter((id) => id !== tag.id));
    deleteTag.mutate(tag.id, {
      onSuccess: () => showToast(`Deleted tag “${tag.name}”`),
      onError: (error) => pushError(error)
    });
  }

  function handleUpdateSettings(patch: Partial<Settings>) {
    updateSettings.mutate(patch, {
      onError: (error) => pushError(error)
    });
  }

  const loading =
    view === "active"
      ? activeQuery.isLoading
      : view === "completed"
        ? completedQuery.isLoading
        : archivedQuery.isLoading;

  const emptyMessage = loading
    ? "Loading…"
    : tasks.length === 0
      ? view === "active"
        ? "No tasks yet"
        : "Nothing here"
      : "No matches";

  const emptyHint = loading
    ? "Fetching your local tasks."
    : tasks.length === 0
      ? view === "active"
        ? "Add your first task to start mapping priorities."
        : "Tasks will appear here when their status changes."
      : "Try another search or clear the filters.";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <h1>Eisenhower Matrix</h1>
            <p>Local priority board</p>
          </div>
        </div>

        <label className="search">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
          />
        </label>

        <div className="tabs" role="tablist" aria-label="Views">
          <button
            className={`tab${view === "active" ? " active" : ""}`}
            role="tab"
            aria-selected={view === "active"}
            onClick={() => changeView("active")}
          >
            In progress <span className="count">{counts.active}</span>
          </button>
          <button
            className={`tab${view === "completed" ? " active" : ""}`}
            role="tab"
            aria-selected={view === "completed"}
            onClick={() => changeView("completed")}
          >
            Completed <span className="count">{counts.completed}</span>
          </button>
          <button
            className={`tab${view === "archived" ? " active" : ""}`}
            role="tab"
            aria-selected={view === "archived"}
            onClick={() => changeView("archived")}
          >
            Archived <span className="count">{counts.archived}</span>
          </button>
        </div>

        <button className="add-btn" onClick={() => setAddOpen(true)}>
          + Add task
        </button>
        <button
          className="icon-btn"
          title="Settings"
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      <div className="filterbar">
        {tags.length > 0 ? (
          <>
            <span className="filter-label">Tags</span>
            {tags.map((tag) => {
              const active = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  className={`tag-chip${active ? " active" : ""}`}
                  onClick={() => handleToggleTag(tag.id)}
                  aria-pressed={active}
                >
                  <i style={{ background: tag.color }} />
                  {tag.name}
                </button>
              );
            })}
          </>
        ) : (
          <span className="filter-empty">
            No tags yet — add them from a task.
          </span>
        )}
        {pendingCount > 0 && (
          <span className="pending-pill">
            Pending review {pendingCount}
          </span>
        )}
        <span className="filter-spacer" />
        {isFiltering && (
          <button className="clear-filter" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      <main
        className={`workspace${selectedTask ? " has-drawer" : ""}`}
      >
        {view === "active" ? (
          <Matrix
            tasks={filteredTasks}
            threshold={settings.threshold}
            selectedId={selectedId}
            forceIndividual={isFiltering}
            onSelect={handleSelect}
            onComplete={handleComplete}
            onNudge={handleNudge}
            emptyMessage={emptyMessage}
            emptyHint={emptyHint}
          />
        ) : (
          <TaskLists
            view={view}
            tasks={filteredTasks}
            onRestore={handleRestore}
            onArchive={handleArchiveFromList}
            onDelete={requestDelete}
          />
        )}

        {selectedTask && (
          <>
            <div
              className="drawer-backdrop"
              onClick={() => setSelectedId(null)}
            />
            <TaskDrawer
              key={selectedTask.id}
              task={selectedTask}
              tags={tags}
              threshold={settings.threshold}
              onClose={() => setSelectedId(null)}
              onPreview={(patch) => handlePreview(selectedTask.id, patch)}
              onSave={(patch) => handleSave(selectedTask.id, patch)}
              onComplete={() => handleComplete(selectedTask)}
              onArchive={() => handleArchive(selectedTask)}
              onDelete={() => requestDelete(selectedTask)}
              onCreateTag={handleCreateTag}
            />
          </>
        )}
      </main>

      {addOpen && (
        <AddTaskModal
          onClose={() => setAddOpen(false)}
          onCreate={handleCreateTask}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          tags={tags}
          onClose={() => setSettingsOpen(false)}
          onUpdateSettings={handleUpdateSettings}
          onDeleteTag={handleDeleteTag}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete task?"
          message={`“${deleteTarget.title}” will be permanently deleted. This cannot be undone.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {toast && (
        <div className="toast show" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button className="toast-action" onClick={runUndo}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
