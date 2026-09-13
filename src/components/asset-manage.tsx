"use client";
import { useState } from "react";
export default function AssetManage({
  id,
  name,
  distributable,
  currentTemplateId,
  linkedToCurrentTemplate,
  onDone,
  onError,
}: {
  id: string;
  name: string;
  distributable: boolean;
  currentTemplateId: string;
  linkedToCurrentTemplate: boolean;
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
        body: JSON.stringify({
          id,
          name: label,
          distributable: rights,
          currentTemplateId,
          linkedToCurrentTemplate,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await onDone();
      onError(method === "PATCH" ? "素材信息已保存" : "素材已删除");
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
          disabled={busy || linkedToCurrentTemplate}
          onClick={() => mutate("DELETE")}
        >
          删除素材
        </button>
      </div>
    </div>
  );
}
