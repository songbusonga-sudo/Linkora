"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { hexToHsv, hsvToHex, HSV } from "@/lib/color";
import RecentColors from "./recent-colors";
import { rememberColor, flushRecentColor } from "@/lib/recent-colors";

const swatches = [
  ["纯白", "#ffffff"],
  ["蜜桃粉", "#edb6be"],
  ["杏子橙", "#efc5a5"],
  ["布丁黄", "#e8d699"],
  ["鼠尾草绿", "#afc6ae"],
  ["雾蓝", "#adc5d9"],
  ["香芋紫", "#c5b6da"],
  ["暖灰", "#a0a0a0"],
];

export default function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const emitted = useRef(value.toLowerCase());
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hex, setHex] = useState(value.toUpperCase());

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (value.toLowerCase() !== emitted.current) setHsv(hexToHsv(value));
    emitted.current = value.toLowerCase();
    setHex(value.toUpperCase());
  }, [value]);

  function update(next: HSV) {
    const color = hsvToHex(next);
    setHsv(next);
    emitted.current = color;
    setHex(color.toUpperCase());
    rememberColor(color);
    onChange(color);
  }
  function choose(color: string) {
    update(hexToHsv(color));
  }
  function place() {
    const popup = panel.current,
      button = trigger.current;
    if (!popup?.matches(":popover-open") || !button) return;
    const anchor = button.getBoundingClientRect();
    const bounds = popup.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    popup.style.left = `${Math.max(12, Math.min(anchor.left, width - bounds.width - 12))}px`;
    const below = anchor.bottom + 10;
    const top =
      below + bounds.height <= height - 12
        ? below
        : anchor.top - bounds.height - 10;
    popup.style.top = `${Math.max(12, Math.min(top, height - bounds.height - 12))}px`;
  }
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const resize = new ResizeObserver(place);
    if (panel.current) resize.observe(panel.current);
    place();
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      resize.disconnect();
    };
  }, [open]);
  function close() {
    panel.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  }
  function pointAt(target: HTMLDivElement, clientX: number, clientY: number) {
    const bounds = target.getBoundingClientRect();
    update({
      ...hsv,
      s: Math.max(
        0,
        Math.min(100, ((clientX - bounds.left) / bounds.width) * 100),
      ),
      v: Math.max(
        0,
        Math.min(
          100,
          100 - ((clientY - bounds.top) / bounds.height) * 100,
        ),
      ),
    });
  }
  function point(event: React.PointerEvent<HTMLDivElement>) {
    pointAt(event.currentTarget, event.clientX, event.clientY);
  }
  function touchPoint(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    event.preventDefault();
    pointAt(event.currentTarget, touch.clientX, touch.clientY);
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="color-swatch-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          if (open) close();
          else {
            panel.current?.showPopover();
            place();
          }
        }}
      >
        <span style={{ backgroundColor: value }} />
      </button>
      {mounted &&
        createPortal(
          <div
            ref={panel}
            id={id}
            popover="auto"
            role="dialog"
            aria-label={`${label}选色面板`}
            className="soft-color-picker"
            onToggle={(event) => {
              setOpen(event.newState === "open");
              if (event.newState === "closed") flushRecentColor();
            }}
          >
            <div className="soft-color-heading">
              <span className="soft-color-icon">
                <img src="/ui/color-picker-cat.png" alt="" width={30} height={19} />
              </span>
              <div>
                <strong>挑个喜欢的颜色</strong>
                <span>{label}</span>
              </div>
              <button
                type="button"
                className="soft-color-close"
                aria-label="关闭选色面板"
                onClick={close}
              >
                <X size={16} />
              </button>
            </div>
            <div
              className="soft-color-plane"
              style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
              role="group"
              aria-label="饱和度与明度色板，方向键微调"
              tabIndex={0}
              onPointerDown={(event) => {
                event.preventDefault();
                // Pointer Events work in modern browsers. The touch handlers
                // below cover WebViews that do not keep pointer capture while
                // a finger moves across the palette.
                event.currentTarget.setPointerCapture?.(event.pointerId);
                point(event);
              }}
              onPointerMove={(event) => {
                event.preventDefault();
                if (event.currentTarget.hasPointerCapture?.(event.pointerId))
                  point(event);
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture?.(event.pointerId))
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
              }}
              onPointerCancel={(event) => {
                if (event.currentTarget.hasPointerCapture?.(event.pointerId))
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
              }}
              onTouchStart={touchPoint}
              onTouchMove={touchPoint}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 10 : 1;
                if (
                  !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                update({
                  ...hsv,
                  s: Math.max(
                    0,
                    Math.min(
                      100,
                      hsv.s +
                        (event.key === "ArrowRight"
                          ? step
                          : event.key === "ArrowLeft"
                            ? -step
                            : 0),
                    ),
                  ),
                  v: Math.max(
                    0,
                    Math.min(
                      100,
                      hsv.v +
                        (event.key === "ArrowUp"
                          ? step
                          : event.key === "ArrowDown"
                            ? -step
                            : 0),
                    ),
                  ),
                });
              }}
            >
              <span
                className="soft-color-cursor"
                style={{
                  left: `${hsv.s}%`,
                  top: `${100 - hsv.v}%`,
                  backgroundColor: value,
                }}
              />
            </div>
            <label className="soft-color-hue-label">
              色相
              <input
                className="soft-color-hue"
                type="range"
                min={0}
                max={360}
                step={1}
                aria-label={`${label}色相`}
                value={hsv.h}
                onChange={(event) =>
                  update({ ...hsv, h: Number(event.target.value) })
                }
              />
            </label>
            <div className="soft-color-presets" aria-label="柔和配色">
              {swatches.map(([name, color]) => (
                <button
                  key={color}
                  type="button"
                  title={name}
                  aria-label={name}
                  aria-pressed={value.toLowerCase() === color}
                  style={{ backgroundColor: color }}
                  onClick={() => choose(color)}
                >
                  {value.toLowerCase() === color && <Check size={14} />}
                </button>
              ))}
            </div>
            <RecentColors value={value} onChange={choose} />
            <div className="soft-color-footer">
              <label>
                <span>HEX</span>
                <input
                  aria-label={`${label} HEX`}
                  value={hex}
                  maxLength={7}
                  spellCheck={false}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setHex(raw);
                    const normalized = raw.startsWith("#") ? raw : `#${raw}`;
                    if (/^#[\da-f]{6}$/i.test(normalized)) choose(normalized);
                  }}
                  onBlur={() => setHex(value.toUpperCase())}
                />
              </label>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
