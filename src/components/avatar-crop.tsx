"use client";

import { useRef, type PointerEvent } from "react";
import type { Crop } from "@/lib/model";

const handles = [
  { x: -1, y: -1, label: "左上", cursor: "nwse-resize" },
  { x: 1, y: -1, label: "右上", cursor: "nesw-resize" },
  { x: -1, y: 1, label: "左下", cursor: "nesw-resize" },
  { x: 1, y: 1, label: "右下", cursor: "nwse-resize" },
] as const;

export function AvatarCrop({
  src,
  crop,
  size,
  onChange,
  shape = "circle",
}: {
  src: string;
  crop: Crop;
  size: { w: number; h: number };
  onChange: (crop: Crop) => void;
  shape?: "circle" | "square";
}) {
  const source = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    scale: number;
    crop: Crop;
    handle?: (typeof handles)[number];
  } | null>(null);

  function resize(start: Crop, delta: number) {
    const cx = start.x + start.size / 2;
    const cy = start.y + start.size / 2;
    const max = 2 * Math.min(cx, cy, size.w - cx, size.h - cy);
    const diameter = Math.max(
      Math.min(16, max),
      Math.min(max, start.size + delta),
    );
    onChange({ x: cx - diameter / 2, y: cy - diameter / 2, size: diameter });
  }

  function startDrag(
    event: PointerEvent<HTMLButtonElement>,
    handle?: (typeof handles)[number],
  ) {
    if (event.button !== 0 || drag.current || !source.current) return;
    const bounds = source.current.getBoundingClientRect();
    if (!bounds.width) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scale: size.w / bounds.width,
      crop: { ...crop },
      handle,
    };
  }

  return (
    <div
      ref={source}
      className={`crop-source avatar-crop-source${shape === "square" ? " is-square" : ""}`}
      style={{
        width: Math.min(300, (300 * size.w) / size.h),
        maxWidth: "100%",
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || event.pointerId !== start.id) return;
        const dx = (event.clientX - start.x) * start.scale;
        const dy = (event.clientY - start.y) * start.scale;
        if (start.handle) {
          // Keep the crop square; circle handles sit on its inscribed circle.
          resize(
            start.crop,
            (shape === "square" ? 1 : Math.SQRT2) * (dx * start.handle.x + dy * start.handle.y),
          );
        } else {
          onChange({
            ...start.crop,
            x: Math.max(
              0,
              Math.min(size.w - start.crop.size, start.crop.x + dx),
            ),
            y: Math.max(
              0,
              Math.min(size.h - start.crop.size, start.crop.y + dy),
            ),
          });
        }
      }}
      onPointerUp={(event) => {
        if (event.pointerId === drag.current?.id) drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
    >
      <img src={src} alt="上传的完整图片" draggable={false} />
      <div
        className="avatar-crop-selection"
        style={{
          left: `${(crop.x / size.w) * 100}%`,
          top: `${(crop.y / size.h) * 100}%`,
          width: `${(crop.size / size.w) * 100}%`,
          height: `${(crop.size / size.h) * 100}%`,
        }}
      >
        <button
          type="button"
          className="avatar-crop-move"
          aria-label="移动头像选区"
          title={`拖动${shape === "square" ? "正方形" : "圆形"}选区移动位置；方向键微调，加减键调整大小`}
          onPointerDown={(event) => startDrag(event)}
          onKeyDown={(event) => {
            const step =
              ((event.shiftKey ? 10 : 1) * size.w) /
              (source.current?.clientWidth || size.w);
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [-step, 0],
              ArrowRight: [step, 0],
              ArrowUp: [0, -step],
              ArrowDown: [0, step],
            };
            if (moves[event.key]) {
              event.preventDefault();
              const [dx, dy] = moves[event.key];
              onChange({ ...crop, x: crop.x + dx, y: crop.y + dy });
            } else if (["+", "=", "-"].includes(event.key)) {
              event.preventDefault();
              resize(crop, event.key === "-" ? -step : step);
            }
          }}
        />
        {handles.map((handle) => (
          <button
            key={handle.label}
            type="button"
            className="avatar-crop-handle"
            aria-label={`调整头像选区大小（${handle.label}）`}
            title="拖动调整大小；方向键微调"
            style={{
              left: `${50 + (handle.x * 50) / (shape === "square" ? 1 : Math.SQRT2)}%`,
              top: `${50 + (handle.y * 50) / (shape === "square" ? 1 : Math.SQRT2)}%`,
              cursor: handle.cursor,
            }}
            onPointerDown={(event) => startDrag(event, handle)}
            onKeyDown={(event) => {
              const direction = {
                ArrowLeft: -handle.x,
                ArrowRight: handle.x,
                ArrowUp: -handle.y,
                ArrowDown: handle.y,
              }[event.key];
              if (direction === undefined) return;
              event.preventDefault();
              const step =
                ((event.shiftKey ? 10 : 1) * size.w) /
                (source.current?.clientWidth || size.w);
              resize(crop, direction * step);
            }}
          />
        ))}
      </div>
    </div>
  );
}
