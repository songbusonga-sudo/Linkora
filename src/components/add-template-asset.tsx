"use client";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Asset } from "@/lib/model";
import { readImage } from "@/lib/images";
import { uploadTemplateAsset } from "@/lib/save-default-display";
import { nextAssetNumber } from "@/lib/asset-numbering";

export default function AddTemplateAsset({
  initialCategory,
  assets,
  onAdded,
  onClose,
}: {
  initialCategory: Asset["category"];
  assets: Asset[];
  onAdded: (assets: Asset[]) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState("");
  const [failures, setFailures] = useState<{ file: File; message: string }[]>(
    [],
  );
  const uploading = useRef(false);

  async function uploadFiles(files: File[]) {
    if (uploading.current || !files.length) return;
    uploading.current = true;
    setBusy(true);
    setDragging(false);
    setFailures([]);
    const added: Asset[] = [],
      failed: { file: File; message: string }[] = [];
    let number = nextAssetNumber(assets, category);
    try {
      for (const [index, file] of files.entries()) {
        setProgress(`正在上传 ${index + 1} / ${files.length} 张`);
        try {
          if (assets.length + added.length >= 500)
            throw Error("当前模板最多可添加 500 张素材");
          await readImage(file);
          const numberedFile = new File([file], String(number), {
            type: file.type,
            lastModified: file.lastModified,
          });
          added.push(await uploadTemplateAsset(numberedFile, category));
          number++;
        } catch (e) {
          failed.push({ file, message: (e as Error).message });
        }
      }
      if (added.length) onAdded(added);
      setProgress(
        `已添加 ${added.length} 张${failed.length ? `，${failed.length} 张失败` : ""}`,
      );
      setFailures(failed);
      if (!failed.length) onClose();
    } finally {
      uploading.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section
        className={`modal asset-upload-modal${dragging ? " is-dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="新增用户可选素材"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = busy ? "none" : "copy";
          if (!busy && e.dataTransfer.types.includes("Files"))
            setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          void uploadFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <div className="section-title">
          <h2>新增素材</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭新增素材"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <label className="field">
          素材用途
          <select
            value={category}
            disabled={busy}
            onChange={(e) => {
              setCategory(e.target.value as Asset["category"]);
              setFailures([]);
              setProgress("");
            }}
          >
            <option value="background">背景</option>
            <option value="avatar">主头像</option>
            <option value="rewardAvatar">赞赏码中心头像</option>
            <option value="rewardIcon">赞赏码右下图标</option>
          </select>
        </label>
        <p className="muted">
          上传后自动加入当前模板，保存并发布后供用户选择。
        </p>
        <label
          className={`upload-label asset-batch-dropzone${busy ? " is-busy" : ""}`}
        >
          <Upload size={26} />
          <strong>
            {busy
              ? progress
              : dragging
                ? "松开即可上传"
                : "拖动图片到这里，或点击批量选择"}
          </strong>
          <span>支持 JPG、PNG、WebP，每张最大 20 MB</span>
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            aria-label="批量选择素材图片"
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void uploadFiles(files);
            }}
          />
        </label>
        <p className="muted">
          按选择或拖入的顺序编号，本次从 {nextAssetNumber(assets, category)}{" "}
          开始，后续上传继续递增。
        </p>
        <p role="status" aria-live="polite">
          {progress}
        </p>
        {failures.length > 0 && (
          <div className="asset-upload-failures" role="alert">
            <ul>
              {failures.map(({ file, message }, index) => (
                <li key={index}>
                  {file.name}：{message}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void uploadFiles(failures.map(({ file }) => file))}
            >
              重试失败图片
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
