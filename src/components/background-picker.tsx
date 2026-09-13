"use client";
import { useEffect, useState } from "react";
import { Asset } from "@/lib/model";
import { readImage } from "@/lib/images";
import { UploadButton } from "./shared";
import AssetPresets from "./asset-presets";

export default function BackgroundPicker({
  assets,
  defaultSrc,
  value,
  onChange,
}: {
  assets: Asset[];
  defaultSrc: string;
  value?: string;
  onChange: (src: string | undefined) => void;
}) {
  const presets = assets.filter((asset) => asset.src !== defaultSrc);
  const firstPreset = presets[0]?.src ?? "";
  const [source, setSource] = useState(
    value?.startsWith("data:") ? "upload" : "presets",
  );
  const [uploaded, setUploaded] = useState(
    value?.startsWith("data:") ? value : "",
  );
  const [preset, setPreset] = useState(
    value && value !== defaultSrc && !value.startsWith("data:")
      ? value
      : firstPreset,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (value?.startsWith("data:")) {
      setUploaded(value);
      setSource("upload");
    } else {
      setPreset(value && value !== defaultSrc ? value : firstPreset);
      setSource("presets");
    }
  }, [value, defaultSrc, firstPreset]);
  return (
    <div className="background-picker">
      <div
        className="background-source-options"
        role="radiogroup"
        aria-label="背景来源"
      >
        <label className="check-label">
          <input
            type="radio"
            name="background-source"
            checked={source === "presets"}
            disabled={busy}
            onChange={() => {
              setSource("presets");
              if (preset) onChange(preset);
            }}
          />
          提供的背景
        </label>
        <label className="check-label">
          <input
            type="radio"
            name="background-source"
            checked={source === "upload"}
            disabled={busy}
            onChange={() => {
              setSource("upload");
              if (uploaded) onChange(uploaded);
            }}
          />
          自己上传
        </label>
      </div>
      {source === "presets" ? (
        <AssetPresets
          assets={presets}
          value={value}
          onChange={(src) => {
            setPreset(src);
            onChange(src);
          }}
        />
      ) : (
        <div className="background-upload">
          {uploaded && <img src={uploaded} alt="自己上传的背景" />}
          <UploadButton
            label={
              busy ? "正在读取…" : uploaded ? "重新上传背景" : "上传背景图片"
            }
            onFile={async (file) => {
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                const src = await readImage(file);
                setUploaded(src);
                onChange(src);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
          {!uploaded && (
            <p className="muted">
              选择图片后应用到背景，切换到预设不会丢失本次上传。
            </p>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
