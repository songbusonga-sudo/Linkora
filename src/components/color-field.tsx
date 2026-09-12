"use client";
import { useRef, useState } from "react";
import { Pipette } from "lucide-react";
import { Reset, UploadButton } from "./shared";
import { loadImage, readImage } from "@/lib/images";
export default function ColorField({
  label,
  value,
  onChange,
  onReset,
  preview,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
  preview?: string;
}) {
  const [sample, setSample] = useState(""),
    [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const rgb = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  async function show(src: string) {
    try {
      setSample(src);
      const im = await loadImage(src);
      requestAnimationFrame(() => {
        const c = canvas.current;
        if (c) {
          c.width = 360;
          c.height = (360 * im.height) / im.width;
          c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
        }
      });
    } catch {
      setError("无法加载取色图片");
    }
  }
  return (
    <div className="color-field">
      <div className="field-heading">
        <label>{label}</label>
        <Reset onClick={onReset} />
      </div>
      <div className="color-inputs">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="hex-value">{value.toUpperCase()}</span>
        {rgb.map((v, i) => (
          <label key={i}>
            {"RGB"[i]}
            <input
              aria-label={`${label} ${"RGB"[i]}`}
              type="number"
              min="0"
              max="255"
              value={v}
              onChange={(e) => {
                const n = [...rgb];
                n[i] = Math.max(0, Math.min(255, Number(e.target.value)));
                onChange(
                  "#" + n.map((v) => v.toString(16).padStart(2, "0")).join(""),
                );
              }}
            />
          </label>
        ))}
      </div>
      <div className="color-actions">
        <UploadButton
          className="text-button"
          label="图片取色"
          onFile={async (f) => {
            try {
              await show(await readImage(f));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
        {preview && (
          <button className="text-button" onClick={() => show(preview)}>
            预览取色
          </button>
        )}
        <button
          className="text-button"
          onClick={async () => {
            try {
              const Picker = (
                window as unknown as {
                  EyeDropper?: new () => {
                    open: () => Promise<{ sRGBHex: string }>;
                  };
                }
              ).EyeDropper;
              if (!Picker) {
                setError("当前浏览器不支持屏幕取色，请使用图片或预览取色");
                return;
              }
              onChange((await new Picker().open()).sRGBHex);
            } catch {}
          }}
        >
          <Pipette size={13} />
          屏幕取色
        </button>
      </div>
      {sample && (
        <div className="sample-box">
          <span className="muted">点击图片选择颜色</span>
          <canvas
            ref={canvas}
            onClick={(e) => {
              const c = canvas.current!,
                r = c.getBoundingClientRect(),
                d = c
                  .getContext("2d")!
                  .getImageData(
                    Math.min(
                      c.width - 1,
                      Math.max(
                        0,
                        Math.floor(((e.clientX - r.left) * c.width) / r.width),
                      ),
                    ),
                    Math.min(
                      c.height - 1,
                      Math.max(
                        0,
                        Math.floor(((e.clientY - r.top) * c.height) / r.height),
                      ),
                    ),
                    1,
                    1,
                  ).data;
              onChange(
                "#" +
                  Array.from(d)
                    .slice(0, 3)
                    .map((v) => v.toString(16).padStart(2, "0"))
                    .join(""),
              );
              setSample("");
            }}
          />
          <button className="text-button" onClick={() => setSample("")}>
            收起
          </button>
        </div>
      )}
      {error && (
        <p className="muted" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
