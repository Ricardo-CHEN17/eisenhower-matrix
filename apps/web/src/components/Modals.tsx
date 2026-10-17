import { useEffect, useRef, useState } from "react";
import type { Settings, Tag, Theme } from "@eisenhower/shared";

interface AddTaskModalProps {
  onClose: () => void;
  onCreate: (input: { title: string; dueDate: string | null }) => Promise<void>;
}

export function AddTaskModal({ onClose, onCreate }: AddTaskModalProps) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const next = title.trim();
    if (!next) {
      setError("Give the task a title first.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onCreate({ title: next, dueDate: dueDate || null });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add task">
        <div className="modal-header">
          <div>
            <h2>Add task</h2>
            <p>
              New tasks start at 50 / 50. If the threshold is 50, they wait in
              Pending review until you rate them.
            </p>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="field">
          <label htmlFor="add-title">Title</label>
          <input
            id="add-title"
            className="text-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="What needs doing?"
            autoFocus
            maxLength={200}
          />
        </div>

        <div className="field">
          <label htmlFor="add-due">Due date</label>
          <input
            id="add-due"
            className="date-input"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>

        {error && <p className="hint form-error">{error}</p>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => void submit()}
            disabled={saving}
          >
            {saving ? "Adding…" : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface SettingsDialogProps {
  settings: Settings;
  tags: Tag[];
  onClose: () => void;
  onUpdateSettings: (patch: Partial<Settings>) => void;
  onDeleteTag: (tag: Tag) => void;
}

const THEME_OPTIONS: Array<{
  value: Theme;
  label: string;
  description: string;
  swatches: string[];
}> = [
  {
    value: "graphite",
    label: "Graphite",
    description: "Dark, calm, easy on the eyes.",
    swatches: ["#1A1D23", "#F04452", "#0087EE", "#FFB020"]
  },
  {
    value: "fog",
    label: "Fog",
    description: "Soft gray daylight, low glare.",
    swatches: ["#DCE2E9", "#E03A47", "#007FD4", "#E0A100"]
  }
];

export function SettingsDialog({
  settings,
  tags,
  onClose,
  onUpdateSettings,
  onDeleteTag
}: SettingsDialogProps) {
  const [threshold, setThreshold] = useState(settings.threshold);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setThreshold(settings.threshold);
  }, [settings.threshold]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const changeThreshold = (value: number) => {
    setThreshold(value);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onUpdateSettings({ threshold: value });
    }, 180);
  };

  const close = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
      onUpdateSettings({ threshold });
    }
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="modal-header">
          <div>
            <h2>Settings</h2>
            <p>Thresholds and themes are saved locally in your database.</p>
          </div>
          <button className="drawer-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        <div className="field">
          <label htmlFor="settings-threshold">
            Quadrant threshold <output>{threshold}</output>
          </label>
          <input
            id="settings-threshold"
            type="range"
            min={30}
            max={70}
            step={1}
            value={threshold}
            onChange={(event) =>
              changeThreshold(Number(event.target.value))
            }
          />
          <div className="range-labels">
            <span>30</span>
            <span>50</span>
            <span>70</span>
          </div>
          <p className="hint">
            A task exactly on the threshold is shown as Pending review.
          </p>
        </div>

        <div className="field">
          <label>Theme</label>
          <div className="theme-switch">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`theme-btn${
                  settings.theme === option.value ? " active" : ""
                }`}
                onClick={() => onUpdateSettings({ theme: option.value })}
              >
                <span className="theme-swatch">
                  {option.swatches.map((color) => (
                    <i key={color} style={{ background: color }} />
                  ))}
                </span>
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Tags</label>
          <div className="tag-manager">
            {tags.map((tag) => (
              <div className="tag-manager-row" key={tag.id}>
                <span className="tag-manager-name">
                  <i style={{ background: tag.color }} />
                  {tag.name}
                </span>
                <button
                  className="danger-link"
                  onClick={() => onDeleteTag(tag)}
                >
                  Delete
                </button>
              </div>
            ))}
            {!tags.length && (
              <p className="hint" style={{ marginTop: 0 }}>
                No tags yet. Create them from a task detail panel.
              </p>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            <p>{message}</p>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
