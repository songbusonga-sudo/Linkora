"use client";
import { useEffect, useRef, useState } from "react";
import { Reset } from "./shared";
import ColorPicker from "./color-picker";
import RecentColors from "./recent-colors";
import { rememberColor, flushRecentColor } from "@/lib/recent-colors";

const RGB_PREVIEW_DELAY = 300;

function RGBChannel({
  label,
  channel,
  value,
  rgb,
  onChange,
}: {
  label: string;
  channel: number;
  value: number;
  rgb: number[];
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    setDraft(String(value));
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function clamp(raw: string) {
    if (!raw.trim()) return;
    const parsed = Number(raw);
    return Number.isFinite(parsed)
      ? Math.max(0, Math.min(255, Math.round(parsed)))
      : undefined;
  }
  function commit(raw: string) {
    const nextValue = clamp(raw);
    if (nextValue === undefined || nextValue === value) return;
    const next = [...rgb];
    next[channel] = nextValue;
    onChange(
      "#" + next.map((part) => part.toString(16).padStart(2, "0")).join(""),
    );
  }
  function schedule(raw: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(raw), RGB_PREVIEW_DELAY);
  }

  return (
    <label>
      {"RGB"[channel]}
      <input
        aria-label={`${label} ${"RGB"[channel]}`}
        type="number"
        inputMode="numeric"
        min="0"
        max="255"
        step="1"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          schedule(event.target.value);
        }}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          const nextValue = clamp(draft);
          commit(draft);
          setDraft(nextValue === undefined ? String(value) : String(nextValue));
        }}
      />
    </label>
  );
}

export default function ColorField({
  label,
  value,
  onChange: change,
  onReset,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  const rgb = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  function onChange(color: string) {
    rememberColor(color);
    change(color);
  }
  return (
    <div className="color-field" onBlur={flushRecentColor}>
      <div className="field-heading">
        <label>{label}</label>
        <Reset onClick={onReset} />
      </div>
      <div className="color-inputs">
        <ColorPicker label={label} value={value} onChange={onChange} />
        <span className="hex-value">{value.toUpperCase()}</span>
        {rgb.map((v, i) => (
          <RGBChannel
            key={i}
            label={label}
            channel={i}
            value={v}
            rgb={rgb}
            onChange={onChange}
          />
        ))}
      </div>
      <RecentColors value={value} onChange={onChange} />
    </div>
  );
}
