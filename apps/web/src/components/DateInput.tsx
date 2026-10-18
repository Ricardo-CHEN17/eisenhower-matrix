import { useEffect, useRef, useState } from "react";

interface DateInputProps {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDisplay(value: string | null): string {
  if (!value) return "";
  const match = ISO_DATE.exec(value);
  return match ? `${match[1]}/${match[2]}/${match[3]}` : "";
}

function formatTyped(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}/${digits.slice(4)}`;
  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
}

/** Returns an ISO date, null for an empty value, or undefined when invalid. */
function parseTyped(text: string): string | null | undefined {
  const digits = text.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.length !== 8) return undefined;

  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== iso
  ) {
    return undefined;
  }
  return iso;
}

export function DateInput({ id, value, onChange }: DateInputProps) {
  const [text, setText] = useState(() => toDisplay(value));
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(toDisplay(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = parseTyped(raw);
    if (parsed === undefined) {
      setText(toDisplay(value));
      return;
    }
    setText(toDisplay(parsed));
    if (parsed !== value) onChange(parsed);
  };

  const handleChange = (raw: string) => {
    const next = formatTyped(raw);
    setText(next);

    const parsed = parseTyped(next);
    if (parsed === null && value !== null) onChange(null);
    else if (parsed !== undefined && parsed !== value) onChange(parsed);
  };

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      textRef.current?.focus();
    }
  };

  return (
    <div className="date-field">
      <input
        ref={textRef}
        id={id}
        className="date-input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        maxLength={10}
        placeholder="YYYY/MM/DD"
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(event.currentTarget.value);
          }
        }}
      />
      <button
        type="button"
        className="date-picker-button"
        aria-label="Open calendar"
        onClick={openPicker}
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <rect x="2" y="3" width="12" height="11" rx="2" />
          <path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" strokeLinecap="round" />
        </svg>
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="native-date-input"
        tabIndex={-1}
        aria-hidden="true"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      />
    </div>
  );
}
