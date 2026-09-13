"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { readRecentColors, RECENT_COLORS_EVENT, RECENT_COLORS_KEY } from "@/lib/recent-colors";

export default function RecentColors({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [colors, setColors] = useState<string[]>([]);
  useEffect(() => {
    const update = () => setColors(readRecentColors());
    const storage = (event: StorageEvent) => {
      if (event.key === RECENT_COLORS_KEY || event.key === null) update();
    };
    update();
    window.addEventListener(RECENT_COLORS_EVENT, update);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(RECENT_COLORS_EVENT, update);
      window.removeEventListener("storage", storage);
    };
  }, []);
  return <div className="recent-colors">
    <span>最近使用</span>
    {colors.length ? <div className="soft-color-presets" aria-label="最近使用的颜色">
      {colors.map((color) => <button type="button" key={color} title={color.toUpperCase()}
        aria-label={`使用最近颜色 ${color.toUpperCase()}`} aria-pressed={value.toLowerCase() === color}
        style={{ backgroundColor: color }} onClick={() => onChange(color)}>
        {value.toLowerCase() === color && <Check size={14} />}
      </button>)}
    </div> : <small>选色后会自动保存在这里</small>}
  </div>;
}
