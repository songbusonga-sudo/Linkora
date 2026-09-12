"use client";
import Link from "next/link";
import {
  Link2,
  ArrowUpRight,
  ShieldCheck,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Crop } from "@/lib/model";
import { cropImage, loadImage } from "@/lib/images";
export function Header({ admin = false }: { admin?: boolean }) {
  return (
    <header className="header">
      <Link href="/" className="brand">
        <span className="brand-mark">
          <Link2 size={23} />
        </span>
        Linkora
        <span className="brand-label">
          {admin ? "模板工作台" : "创作工作台"}
        </span>
      </Link>
      <nav>
        <span className="header-note">让每一份心意，都有好看的落点</span>
        <Link className="header-link" href={admin ? "/" : "/admin"}>
          {admin ? "返回制作页" : "模板管理"}
          <ArrowUpRight size={15} />
        </Link>
      </nav>
    </header>
  );
}
export function LocalNote() {
  return (
    <div className="local-note">
      <ShieldCheck size={17} />
      <span>你的图片仅在当前浏览器中处理</span>
    </div>
  );
}
export function Reset({
  onClick,
  label = "恢复默认",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button type="button" className="text-button" onClick={onClick}>
      <RotateCcw size={13} />
      {label}
    </button>
  );
}
export function UploadButton({
  label,
  onFile,
  accept = "image/png,image/jpeg,image/webp",
  className = "secondary",
}: {
  label: string;
  onFile: (f: File) => void;
  accept?: string;
  className?: string;
}) {
  return (
    <label className={`upload-label ${className}`}>
      <Upload size={15} />
      {label}
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}
export function CropDialog({
  src,
  initial,
  title,
  onClose,
  onConfirm,
  reward = false,
}: {
  src: string;
  initial: Crop;
  title: string;
  onClose: () => void;
  onConfirm: (crop: Crop, url: string) => void;
  reward?: boolean;
}) {
  const [crop, setCrop] = useState(initial),
    [size, setSize] = useState({ w: 1, h: 1 }),
    [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    loadImage(src).then((im) => {
      if (active) setSize({ w: im.width, h: im.height });
    });
    return () => {
      active = false;
    };
  }, [src]);
  useEffect(() => {
    let active = true;
    loadImage(src).then((im) => {
      if (!active || !canvas.current) return;
      const c = canvas.current;
      c.width = 460;
      c.height = 460;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, 460, 460);
      ctx.drawImage(im, crop.x, crop.y, crop.size, crop.size, 0, 0, 460, 460);
    });
    return () => {
      active = false;
    };
  }, [src, crop]);
  const update = (p: Partial<Crop>) =>
    setCrop((c) => {
      const n = { ...c, ...p };
      n.size = Math.max(16, Math.min(n.size, size.w, size.h));
      n.x = Math.max(0, Math.min(n.x, size.w - n.size));
      n.y = Math.max(0, Math.min(n.y, size.h - n.size));
      return n;
    });
  return (
    <div
      className="modal-backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="section-title">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="关闭裁切"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="muted">
          {reward
            ? "完整保留头像、右下图标、编码图案与边缘留白。拖动取景参数，让码主体居中。"
            : "调整取景，头像会自动进入模板固定区域。"}
        </p>
        <div className="crop-images">
          <div className="crop-source">
            <img src={src} alt="上传的完整图片" />
            <span
              style={{
                left: `${(crop.x / size.w) * 100}%`,
                top: `${(crop.y / size.h) * 100}%`,
                width: `${(crop.size / size.w) * 100}%`,
                height: `${(crop.size / size.h) * 100}%`,
              }}
            />
          </div>
          <canvas ref={canvas} className={reward ? "" : "round-preview"} />
        </div>
        {(["x", "y", "size"] as const).map((key) => (
          <label className="range-field" key={key}>
            <span>
              {key === "x" ? "水平取景" : key === "y" ? "上下取景" : "取景范围"}
              <small>{Math.round(crop[key])} px</small>
            </span>
            <input
              aria-label={
                key === "x" ? "水平取景" : key === "y" ? "上下取景" : "取景范围"
              }
              type="range"
              min={key === "size" ? 16 : 0}
              max={
                key === "x"
                  ? Math.max(1, size.w - crop.size)
                  : key === "y"
                    ? Math.max(1, size.h - crop.size)
                    : Math.min(size.w, size.h)
              }
              value={crop[key]}
              onChange={(e) => update({ [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        {reward && (
          <div className="notice">
            自动定位结果需要你确认。下一步还可对照固定覆盖层微调，确保没有遮挡编码图案。
          </div>
        )}
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                onConfirm(crop, await cropImage(src, crop));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "处理中…" : "确认取景"}
          </button>
        </div>
      </section>
    </div>
  );
}
