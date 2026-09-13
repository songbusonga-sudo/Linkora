"use client";
import { Asset } from "@/lib/model";
export default function AssetPresets({
  assets,
  value,
  onChange,
}: {
  assets: Asset[];
  value?: string;
  onChange: (src: string) => void;
}) {
  if (!assets.length) return null;
  return (
    <div className="preset-gallery">
      {assets.map((a) => (
        <button
          key={a.id}
          className={value === a.src ? "active" : ""}
          aria-pressed={value === a.src}
          aria-label={a.name}
          onClick={() => onChange(a.src)}
          title={a.name}
        >
          <img src={a.src} alt={a.name} />
          <span>{a.name}</span>
        </button>
      ))}
    </div>
  );
}
