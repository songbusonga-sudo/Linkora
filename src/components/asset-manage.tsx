"use client";
import { useState } from "react";
export default function AssetManage({
  id,
  name,
  distributable,
  onDone,
  onError,
}: {
  id: string;
  name: string;
  distributable: boolean;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [label, setLabel] = useState(name),
    [rights, setRights] = useState(distributable),
    [busy, setBusy] = useState(false);
  async function mutate(method: "PATCH" | "DELETE") {
    setBusy(true);
    try {
      const r = await fetch("/api/assets", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: label, distributable: rights }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await onDone();
      onError(method === "PATCH" ? "素材信息已保存" : "未被引用的素材已删除");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="asset-manage">
      <input
        aria-label="素材名称"
        value={label}
        maxLength={100}
        onChange={(e) => setLabel(e.target.value)}
      />
      <label className="check-label">
        <input
          type="checkbox"
          checked={rights}
          onChange={(e) => setRights(e.target.checked)}
        />
        可公开分发
      </label>
      <div>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => mutate("PATCH")}
        >
          保存信息
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => mutate("DELETE")}
        >
          删除未引用素材
        </button>
      </div>
    </div>
  );
}
