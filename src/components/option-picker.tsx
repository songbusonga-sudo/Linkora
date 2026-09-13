"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Template, selectedChoice } from "@/lib/model";

export default function OptionPicker({
  option,
  nodes,
  value,
  defaultValue,
  onChange,
}: {
  option: Template["options"][number];
  nodes: Template["nodes"];
  value?: string;
  defaultValue?: string;
  onChange: (value: string) => void;
}) {
  const selected = selectedChoice(option, value);
  const index = option.choices.indexOf(selected);
  const artwork =
    selected.nodeIds.length === 1
      ? nodes.find((node) => node.id === selected.nodeIds[0])
      : undefined;
  const move = (offset: number) =>
    onChange(
      option.choices[
        (index + offset + option.choices.length) % option.choices.length
      ].id,
    );
  return (
    <div className="field option-picker" role="group" aria-label={option.name}>
      <div className="field-heading">
        <span>{option.name}</span>
        <button
          type="button"
          className="text-button"
          onClick={() => onChange(defaultValue ?? option.defaultId)}
        >
          恢复默认
        </button>
      </div>
      <div className="option-switcher">
        <button
          type="button"
          className="secondary"
          aria-label={`上一个${option.name}`}
          disabled={option.choices.length < 2}
          onClick={() => move(-1)}
        >
          <ChevronLeft size={18} />
        </button>
        <select
          aria-label={option.name}
          value={selected.id}
          onChange={(e) => onChange(e.target.value)}
        >
          {option.choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="secondary"
          aria-label={`下一个${option.name}`}
          disabled={option.choices.length < 2}
          onClick={() => move(1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      {artwork && (
        <div className="option-artwork">
          <img src={artwork.src} alt={`${option.name} ${selected.name}`} />
        </div>
      )}
      <span className="muted" aria-live="polite">
        {index + 1} / {option.choices.length} · 每次仅显示一个款式
      </span>
    </div>
  );
}
