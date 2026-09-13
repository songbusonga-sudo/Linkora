"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ZoomIn,
} from "lucide-react";
import { loadImage } from "@/lib/images";

type Pixel = { x: number; y: number; color: string };

export default function ImageColorSampler({
  src,
  onChange,
  onClose,
}: {
  src: string;
  onChange: (color: string) => void;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const magnifier = useRef<HTMLCanvasElement>(null);
  const [pixel, setPixel] = useState<Pixel>();
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [magnified, setMagnified] = useState(true);
  const [error, setError] = useState("");

  function select(x: number, y: number) {
    const c = canvas.current;
    if (!c) return;
    x = Math.max(0, Math.min(c.width - 1, Math.floor(x)));
    y = Math.max(0, Math.min(c.height - 1, Math.floor(y)));
    const data = c.getContext("2d")!.getImageData(x, y, 1, 1).data;
    setPixel({
      x,
      y,
      color:
        "#" +
        Array.from(data)
          .slice(0, 3)
          .map((v) => v.toString(16).padStart(2, "0"))
          .join(""),
    });
  }

  useEffect(() => {
    let active = true;
    setPixel(undefined);
    setError("");
    loadImage(src)
      .then((im) => {
        if (!active || !canvas.current) return;
        const c = canvas.current;
        // Preserve source pixels; CSS alone fits the image to the small screen.
        c.width = im.naturalWidth;
        c.height = im.naturalHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(im, 0, 0);
        setSize({ width: c.width, height: c.height });
        select(c.width / 2, c.height / 2);
      })
      .catch(() => {
        if (active) setError("无法加载取色图片，请重新选择。");
      });
    return () => {
      active = false;
    };
  }, [src]);

  useEffect(() => {
    if (!pixel || !magnifier.current || !canvas.current) return;
    const ctx = magnifier.current.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 132, 132);
    ctx.drawImage(
      canvas.current,
      pixel.x - 5,
      pixel.y - 5,
      11,
      11,
      0,
      0,
      132,
      132,
    );
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.strokeRect(59, 59, 14, 14);
    ctx.strokeStyle = "#263c32";
    ctx.lineWidth = 1;
    ctx.strokeRect(59.5, 59.5, 13, 13);
  }, [pixel, magnified]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!pixel) return;
    const rect = event.currentTarget.getBoundingClientRect();
    select(
      ((event.clientX - rect.left) * size.width) / rect.width,
      ((event.clientY - rect.top) * size.height) / rect.height,
    );
  }
  const directions = [
    { name: "向左移动一个像素", dx: -1, dy: 0, icon: ArrowLeft },
    { name: "向上移动一个像素", dx: 0, dy: -1, icon: ArrowUp },
    { name: "向下移动一个像素", dx: 0, dy: 1, icon: ArrowDown },
    { name: "向右移动一个像素", dx: 1, dy: 0, icon: ArrowRight },
  ];
  return (
    <div className="sample-box" role="group" aria-label="图片像素取色">
      <div className="sample-heading">
        <span className="muted">拖动选点，放大查看后确认颜色</span>
        <button
          type="button"
          className="sample-zoom"
          aria-pressed={magnified}
          onClick={() => setMagnified(!magnified)}
        >
          <ZoomIn size={15} />
          像素放大镜
        </button>
      </div>
      {error ? (
        <p role="status">{error}</p>
      ) : (
        <>
          <div className="sample-image">
            <canvas
              ref={canvas}
              className="sample-source"
              tabIndex={0}
              aria-label="取色图片，方向键逐像素移动，回车确认"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                point(event);
              }}
              onPointerMove={(event) => {
                if (
                  event.pointerType === "mouse" ||
                  event.currentTarget.hasPointerCapture(event.pointerId)
                )
                  point(event);
              }}
              onPointerUp={(event) => {
                point(event);
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onKeyDown={(event) => {
                if (!pixel) return;
                const d = {
                  ArrowLeft: [-1, 0],
                  ArrowRight: [1, 0],
                  ArrowUp: [0, -1],
                  ArrowDown: [0, 1],
                }[event.key];
                if (d) {
                  event.preventDefault();
                  select(pixel.x + d[0], pixel.y + d[1]);
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  onChange(pixel.color);
                  onClose();
                }
              }}
            />
            {pixel && (
              <span
                className="sample-crosshair"
                aria-hidden="true"
                style={{
                  left: `${((pixel.x + 0.5) / size.width) * 100}%`,
                  top: `${((pixel.y + 0.5) / size.height) * 100}%`,
                }}
              />
            )}
          </div>
          {pixel && (
            <div className="sample-detail">
              {magnified && (
                <canvas
                  ref={magnifier}
                  width={132}
                  height={132}
                  className="sample-magnifier"
                  aria-label="12 倍像素放大图，中央方框为当前像素"
                />
              )}
              <div className="sample-pixel-info">
                <span className="sample-coordinates" aria-live="polite">
                  X {pixel.x} · Y {pixel.y}
                </span>
                <span className="sample-color-value">
                  <i style={{ backgroundColor: pixel.color }} />
                  {pixel.color.toUpperCase()}
                </span>
                <span className="muted">方向键微调 · 每次 1 像素</span>
                <div className="sample-nudge">
                  {directions.map((d) => (
                    <button
                      key={d.name}
                      type="button"
                      aria-label={d.name}
                      onClick={() => select(pixel.x + d.dx, pixel.y + d.dy)}
                    >
                      <d.icon size={16} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <div className="sample-footer">
        <button type="button" className="text-button" onClick={onClose}>
          收起
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!pixel || !!error}
          onClick={() => {
            if (pixel) {
              onChange(pixel.color);
              onClose();
            }
          }}
        >
          使用这个颜色
        </button>
      </div>
    </div>
  );
}
