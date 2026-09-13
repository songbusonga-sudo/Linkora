"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type TouchEvent,
} from "react";
import type { BackgroundTransform, TemplateNode } from "@/lib/model";
import { loadImage } from "@/lib/images";
import {
  type BackgroundViewport,
  backgroundRect,
  clampBackgroundToViewport,
  clampBackgroundTransform,
  defaultBackgroundTransform,
  scaleBackgroundFromCorner,
} from "@/lib/background-transform";

const corners = [
  { x: -1, y: -1, name: "左上" },
  { x: 1, y: -1, name: "右上" },
  { x: -1, y: 1, name: "左下" },
  { x: 1, y: 1, name: "右下" },
] as const;
const wrapAngle = (value: number) =>
  ((((value + 180) % 360) + 360) % 360) - 180;
const unrotate = (x: number, y: number, degrees: number) => {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: x * Math.cos(angle) + y * Math.sin(angle),
    y: -x * Math.sin(angle) + y * Math.cos(angle),
  };
};

export default function BackgroundCrop({
  src,
  canvas,
  node,
  viewport,
  value,
  legacyY,
  onChange,
  onDone,
}: {
  src: string;
  canvas: { width: number; height: number };
  node: TemplateNode;
  viewport?: BackgroundViewport;
  value?: BackgroundTransform;
  legacyY: number;
  onChange: (value: BackgroundTransform) => void;
  onDone: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setSize(undefined);
    setFailed(false);
    loadImage(src)
      .then((image) => {
        if (active) setSize({ width: image.width, height: image.height });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [src]);
  const cropViewport = viewport ?? {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
  };
  const base = size
    ? backgroundRect(canvas, node, src, size, undefined, legacyY, cropViewport)
    : undefined;
  const baseCoversViewport =
    !!base &&
    base.width >= cropViewport.width &&
    base.height >= cropViewport.height;
  const current = base && baseCoversViewport
    ? clampBackgroundToViewport(
        value ?? defaultBackgroundTransform(),
        base,
        canvas,
        cropViewport,
      )
    : (value ?? defaultBackgroundTransform());
  const rect = size
    ? backgroundRect(canvas, node, src, size, current, legacyY, cropViewport)
    : undefined;
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    value: BackgroundTransform;
    corner?: (typeof corners)[number];
    center: { x: number; y: number };
    cornerVector?: { x: number; y: number };
  } | null>(null);
  const pinch = useRef<{
    distance: number;
    value: BackgroundTransform;
  } | null>(null);
  const change = (next: BackgroundTransform) =>
    onChange(
      base
        ? baseCoversViewport
          ? clampBackgroundToViewport(next, base, canvas, cropViewport)
          : clampBackgroundTransform(next)
        : clampBackgroundTransform(next),
    );
  function start(
    event: PointerEvent<HTMLButtonElement>,
    corner?: (typeof corners)[number],
  ) {
    if (
      event.button !== 0 ||
      drag.current ||
      !frame.current ||
      !rect ||
      event.currentTarget.disabled
    )
      return;
    const bounds = frame.current.getBoundingClientRect();
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const cx =
      bounds.left + ((rect.x + rect.width / 2) / canvas.width) * bounds.width;
    const cy =
      bounds.top + ((rect.y + rect.height / 2) / canvas.height) * bounds.height;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: bounds.width,
      height: bounds.height,
      value: current,
      corner,
      center: { x: cx, y: cy },
      cornerVector: corner
        ? { x: event.clientX - cx, y: event.clientY - cy }
        : undefined,
    };
  }
  function startPinch(event: TouchEvent<HTMLButtonElement>) {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    const first = event.touches[0]!, second = event.touches[1]!;
    drag.current = null;
    pinch.current = {
      distance: Math.hypot(
        first.clientX - second.clientX,
        first.clientY - second.clientY,
      ),
      value: current,
    };
  }
  function resizePinch(event: TouchEvent<HTMLButtonElement>) {
    const start = pinch.current;
    if (!start || !start.distance || event.touches.length !== 2) return;
    event.preventDefault();
    const first = event.touches[0]!, second = event.touches[1]!;
    const distance = Math.hypot(
      first.clientX - second.clientX,
      first.clientY - second.clientY,
    );
    change({
      ...start.value,
      scale: start.value.scale * (distance / start.distance),
    });
  }
  return (
    <div
      ref={frame}
      className="background-crop background-preview-overlay"
      role="group"
      aria-label="背景大小与位置"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onDone();
        }
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = (event.clientX - start.x) / start.width,
          dy = (event.clientY - start.y) / start.height;
        if (start.corner && start.cornerVector && base) {
          const pointer = {
            x: event.clientX - start.center.x,
            y: event.clientY - start.center.y,
          };
          const vector = start.cornerVector;
          const length = vector.x ** 2 + vector.y ** 2;
          change(
            scaleBackgroundFromCorner(
              start.value,
              start.corner,
              start.value.scale *
                ((pointer.x * vector.x + pointer.y * vector.y) / length),
              base,
              canvas,
            ),
          );
        } else
          change({
            ...start.value,
            x:
              event.pointerType === "touch"
                ? start.value.x
                : start.value.x + dx,
            y: start.value.y + dy,
          });
      }}
      onPointerUp={() => {
        drag.current = null;
        pinch.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
        pinch.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
        pinch.current = null;
      }}
    >
      {rect && (
        <button
          type="button"
          className="background-crop-move"
          aria-label="拖动背景位置"
          disabled={!size}
          style={
            {
              inset: "auto",
              left: `${(cropViewport.x / canvas.width) * 100}%`,
              top: `${(cropViewport.y / canvas.height) * 100}%`,
              width: `${(cropViewport.width / canvas.width) * 100}%`,
              height: `${(cropViewport.height / canvas.height) * 100}%`,
            } satisfies CSSProperties
          }
          onPointerDown={(event) => start(event)}
          onTouchStart={startPinch}
          onTouchMove={resizePinch}
          onTouchEnd={() => {
            pinch.current = null;
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 0.05 : 0.005;
            const move: Record<string, [number, number]> = {
              ArrowLeft: [-step, 0],
              ArrowRight: [step, 0],
              ArrowUp: [0, -step],
              ArrowDown: [0, step],
            };
            if (move[event.key]) {
              event.preventDefault();
              const [x, y] = move[event.key];
              change({ ...current, x: current.x + x, y: current.y + y });
            }
          }}
        />
      )}
      {rect && (
        <div
          className="background-crop-selection"
          style={
            {
              left: `${(cropViewport.x / canvas.width) * 100}%`,
              top: `${(cropViewport.y / canvas.height) * 100}%`,
              width: `${(cropViewport.width / canvas.width) * 100}%`,
              height: `${(cropViewport.height / canvas.height) * 100}%`,
            } satisfies CSSProperties
          }
        >
          {corners.map((corner) => (
            <button
              key={corner.name}
              type="button"
              className="background-crop-handle"
              aria-label={`缩放背景（${corner.name}）`}
              disabled={!size}
              style={{
                left: corner.x < 0 ? 0 : "100%",
                top: corner.y < 0 ? 0 : "100%",
                cursor: corner.x === corner.y ? "nwse-resize" : "nesw-resize",
              }}
              onPointerDown={(event) => start(event, corner)}
              onKeyDown={(event) => {
                const direction = {
                  ArrowLeft: -corner.x,
                  ArrowRight: corner.x,
                  ArrowUp: -corner.y,
                  ArrowDown: corner.y,
                }[event.key];
                if (direction !== undefined) {
                  event.preventDefault();
                  if (base)
                    change(
                      scaleBackgroundFromCorner(
                        current,
                        corner,
                        current.scale +
                          direction * (event.shiftKey ? 0.1 : 0.01),
                        base,
                        canvas,
                      ),
                    );
                }
              }}
            />
          ))}
        </div>
      )}
      {failed && (
        <span className="background-preview-error" role="alert">
          背景加载失败
        </span>
      )}
    </div>
  );
}
