"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  ShieldCheck,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { Crop } from "@/lib/model";
import { cropImage, loadImage, suggestCrop } from "@/lib/images";
import { AvatarCrop } from "./avatar-crop";
export function Header({ admin = false }: { admin?: boolean }) {
  return (
    <header className="header">
      <Link href="/" className="brand">
        <img className="brand-mark" src="/brand/mascot.png?v=bear" alt="" width={60} height={46} />
        Linkora
      </Link>
      {admin && (
        <nav>
          <Link className="header-link" href="/">
            返回制作页
            <ArrowUpRight size={15} />
          </Link>
        </nav>
      )}
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
  defaultCrop,
  title,
  onClose,
  onConfirm,
  reward = false,
  shape = "circle",
}: {
  src: string;
  initial: Crop;
  defaultCrop?: Crop;
  title: string;
  onClose: () => void;
  onConfirm: (crop: Crop, url: string, defaultCrop: Crop) => void;
  reward?: boolean;
  shape?: "circle" | "square";
}) {
  const [crop, setCrop] = useState(initial),
    [size, setSize] = useState({ w: 1, h: 1 }),
    [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [resetBounds, setResetBounds] = useState<Crop | undefined>(
    defaultCrop ?? (reward ? undefined : initial),
  );
  const [resetError, setResetError] = useState("");
  useEffect(() => {
    let active = true;
    setResetError("");
    if (defaultCrop || !reward) {
      setResetBounds({ ...(defaultCrop ?? initial) });
    } else {
      // Recover the automatic crop for images already uploaded before this
      // feature was added; never use a manually adjusted crop as the default.
      setResetBounds(undefined);
      suggestCrop(src)
        .then((bounds) => {
          if (active) setResetBounds(bounds);
        })
        .catch(() => {
          if (active) setResetError("自动定位未能完成，请重新上传图片后重试。");
        });
    }
    return () => {
      active = false;
    };
  }, [src, defaultCrop, initial, reward]);
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
      n.size = Math.max(
        Math.min(16, size.w, size.h),
        Math.min(n.size, size.w, size.h),
      );
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
            : shape === "square" ? "拖动正方形选区调整位置，拖动四角调整大小；头像按赞赏码的正方形图层显示。"
            : "拖动圆形选区调整位置，拖动圆周上的控制点调整大小。"}
        </p>
        <div className={`crop-images${reward ? "" : " avatar-crop-images"}`}>
          {reward ? (
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
          ) : (
            <AvatarCrop src={src} crop={crop} size={size} onChange={update} shape={shape} />
          )}
          <canvas ref={canvas} className={reward || shape === "square" ? "square-preview" : "round-preview"} />
        </div>
        {reward &&
          (["x", "y", "size"] as const).map((key) => (
            <label className="range-field" key={key}>
              <span>
                {key === "x"
                  ? "水平取景"
                  : key === "y"
                    ? "上下取景"
                    : "取景范围"}
                <small>{Math.round(crop[key])} px</small>
              </span>
              <input
                aria-label={
                  key === "x"
                    ? "水平取景"
                    : key === "y"
                      ? "上下取景"
                      : "取景范围"
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
          <button
            type="button"
            className="secondary crop-reset"
            disabled={busy || !resetBounds}
            title={reward ? "恢复自动定位的取景位置与范围" : "恢复初始取景"}
            onClick={() => {
              if (resetBounds) setCrop({ ...resetBounds });
            }}
          >
            <RotateCcw size={15} />
            恢复默认
          </button>
          <button className="secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="primary"
            disabled={busy || !resetBounds}
            onClick={async () => {
              setBusy(true);
              try {
                onConfirm(crop, await cropImage(src, crop), resetBounds!);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "处理中…" : "确认取景"}
          </button>
        </div>
        {resetError && (
          <p className="help-text" role="alert">
            {resetError}
          </p>
        )}
      </section>
    </div>
  );
}

const rewardHandles = [
  { x: -1, y: -1, label: "左上", cursor: "nwse-resize" },
  { x: 1, y: -1, label: "右上", cursor: "nesw-resize" },
  { x: -1, y: 1, label: "左下", cursor: "nesw-resize" },
  { x: 1, y: 1, label: "右下", cursor: "nwse-resize" },
] as const;

type RewardGuide = { x: number; y: number; size: number };

function clampRewardCrop(crop: Crop, imageSize: { w: number; h: number }): Crop {
  const size = Math.max(
    Math.min(16, imageSize.w, imageSize.h),
    Math.min(crop.size, imageSize.w, imageSize.h),
  );
  return {
    size,
    x: Math.max(0, Math.min(crop.x, imageSize.w - size)),
    y: Math.max(0, Math.min(crop.y, imageSize.h - size)),
  };
}

/**
 * Lets the user line up the original reward-code avatar with the template's
 * cover. The guide never moves: the uploaded image moves underneath it.
 */
export function RewardAlignDialog({
  src,
  initial,
  defaultCrop,
  guide,
  onClose,
  onConfirm,
}: {
  src: string;
  initial: Crop;
  defaultCrop: Crop;
  guide: RewardGuide;
  onClose: () => void;
  onConfirm: (crop: Crop) => void;
}) {
  const [crop, setCrop] = useState(initial);
  const [imageSize, setImageSize] = useState({ w: 1, h: 1 });
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    scale: number;
    crop: Crop;
    handle?: (typeof rewardHandles)[number];
  } | null>(null);

  useEffect(() => {
    let active = true;
    loadImage(src).then((image) => {
      if (active) setImageSize({ w: image.width, h: image.height });
    });
    return () => {
      active = false;
    };
  }, [src]);

  const update = (next: Crop) =>
    setCrop(clampRewardCrop(next, imageSize));
  const guideCenter = {
    x: guide.x + guide.size / 2,
    y: guide.y + guide.size / 2,
  };
  const resizeAroundGuide = (start: Crop, change: number) => {
    const size = Math.max(
      Math.min(16, imageSize.w, imageSize.h),
      Math.min(start.size - change, imageSize.w, imageSize.h),
    );
    // Keep the source point currently under the guide's centre stationary.
    const anchorX = start.x + guideCenter.x * start.size;
    const anchorY = start.y + guideCenter.y * start.size;
    update({
      size,
      x: anchorX - guideCenter.x * size,
      y: anchorY - guideCenter.y * size,
    });
  };
  const begin = (
    event: PointerEvent<HTMLButtonElement>,
    handle?: (typeof rewardHandles)[number],
  ) => {
    if (event.button !== 0 || drag.current || !stage.current) return;
    const bounds = stage.current.getBoundingClientRect();
    if (!bounds.width) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scale: crop.size / bounds.width,
      crop: { ...crop },
      handle,
    };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || event.pointerId !== start.id) return;
    const dx = (event.clientX - start.x) * start.scale;
    const dy = (event.clientY - start.y) * start.scale;
    if (start.handle) {
      resizeAroundGuide(
        start.crop,
        ((dx * start.handle.x + dy * start.handle.y) / 2),
      );
    } else {
      // Moving the image right reveals source pixels further left.
      update({ ...start.crop, x: start.crop.x - dx, y: start.crop.y - dy });
    }
  };
  const zoom = (event: WheelEvent<HTMLDivElement>) => {
    // Browser pinch gestures are delivered as ctrl+wheel. Ordinary two-finger
    // scrolling remains available for the dialog itself.
    if (!event.ctrlKey) return;
    event.preventDefault();
    resizeAroundGuide(crop, event.deltaY * (crop.size / 520));
  };
  const imageStyle = {
    left: `${(-crop.x / crop.size) * 100}%`,
    top: `${(-crop.y / crop.size) * 100}%`,
    width: `${(imageSize.w / crop.size) * 100}%`,
    height: `${(imageSize.h / crop.size) * 100}%`,
  };

  return (
    <div className="modal-backdrop reward-align-backdrop">
      <section
        className="modal reward-align-modal"
        role="dialog"
        aria-modal="true"
        aria-label="对齐赞赏码头像"
      >
        <div className="section-title">
          <h2>对齐赞赏码头像</h2>
          <button
            className="icon-button"
            aria-label="取消对齐赞赏码"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="reward-align-instruction">
          请将赞赏码中间的头像完整对齐到方框内；未对齐会导致原头像露出，影响成图效果。
        </p>
        <div
          ref={stage}
          className="reward-align-stage"
          onPointerMove={move}
          onPointerUp={(event) => {
            if (event.pointerId === drag.current?.id) drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onWheel={zoom}
        >
          <div className="reward-align-artwork" style={imageStyle}>
            <button
              type="button"
              className="reward-align-move"
              aria-label="拖动赞赏码调整位置"
              onPointerDown={(event) => begin(event)}
            >
              <img src={src} alt="待对齐的赞赏码" draggable={false} />
            </button>
          </div>
          <div
            className="reward-align-guide"
            aria-label="赞赏码头像对齐框"
            style={{
              left: `${guide.x * 100}%`,
              top: `${guide.y * 100}%`,
              width: `${guide.size * 100}%`,
              height: `${guide.size * 100}%`,
            }}
          />
          {rewardHandles.map((handle) => (
            <button
              key={handle.label}
              type="button"
              className="reward-align-handle"
              aria-label={`缩放赞赏码（${handle.label}）`}
              title="拖动缩放赞赏码"
              style={{
                left: `${handle.x < 0 ? 0 : 100}%`,
                top: `${handle.y < 0 ? 0 : 100}%`,
                cursor: handle.cursor,
              }}
              onPointerDown={(event) => begin(event, handle)}
            />
          ))}
        </div>
        <p className="muted reward-align-help">
          拖动图片调整位置，拖动四角缩放；触控板双指捏合可缩放。
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary crop-reset"
            onClick={() => update({ ...defaultCrop })}
          >
            <RotateCcw size={15} />
            恢复自动对齐
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button type="button" className="primary" onClick={() => onConfirm(crop)}>
            确认对齐
          </button>
        </div>
      </section>
    </div>
  );
}
