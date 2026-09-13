"use client";
import { useState } from "react";
import type {
  Template,
  TemplateNode,
  CodeKind,
  CodeInput,
  Crop,
} from "@/lib/model";
import { emptyEdits } from "@/lib/model";
import { CODE_ROLES, CODE_NAMES } from "@/lib/code-placement";
import {
  readImage,
  decodeImage,
  autoCropReward,
  loadImage,
} from "@/lib/images";
import { presetStyle } from "@/lib/qr";
import { drawTemplate, checkExport, checkStyled } from "@/lib/render";
import { UploadButton, CropDialog } from "./shared";
import LayerPosition from "./layer-position";

export default function CodePlacement({
  template,
  saved,
  onChange,
}: {
  template: Template;
  saved?: Template;
  onChange: (nodes: TemplateNode[]) => void;
}) {
  const [previewTarget, setPreviewTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const [kind, setKind] = useState<CodeKind>("wechat");
  const [codes, setCodes] = useState<Partial<Record<CodeKind, CodeInput>>>(
    () => {
      const example = (channel: string) => ({
        image: "",
        name: "测试示例",
        confirmed: true,
        content: `https://example.com/linkora/preview/${channel}/sample-only-012345678901234567890123456789`,
      });
      return {
        wechat: example("wechat"),
        alipay: example("alipay"),
        ...template.defaults?.codes,
      };
    },
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [crop, setCrop] = useState<{
    image: string;
    initial: Crop;
    name: string;
  } | null>(null);
  const node = template.nodes.find((n) => n.role === kind)!;
  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    const selectedKind = kind;
    try {
      const image = await readImage(file);
      if (selectedKind === "reward") {
        const im = await loadImage(image);
        const size = Math.min(im.width, im.height);
        let initial = {
          x: (im.width - size) / 2,
          y: (im.height - size) / 2,
          size,
        };
        try {
          initial = await autoCropReward(image);
        } catch {
          setMessage("未能自动确定赞赏码，请手动框选完整原码及必要留白。");
        }
        setCrop({ image, initial, name: file.name });
      } else {
        const content = await decodeImage(image);
        setCodes((c) => ({
          ...c,
          [selectedKind]: { image, content, name: file.name, confirmed: true },
        }));
        setMessage("已按固定主体尺寸生成，上传截图的大小和留白不影响落位。");
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setBusy(true);
    setMessage("");
    try {
      const styles = template.defaults?.styles ?? {
        wechat: presetStyle(),
        alipay: presetStyle(),
      };
      for (const role of ["wechat", "alipay"] as const)
        await checkStyled(codes[role]!.content!, styles[role]);
      const result = await drawTemplate(template, emptyEdits(), codes, styles);
      checkExport(result, template, codes, styles);
      setMessage(
        "两个收款码的美化和成品识别均通过，内容一致。实际收款请再用对应 App 测试。",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="position-workspace code-placement-panel">
      <div className="position-preview-panel" ref={setPreviewTarget} />
      <div className="position-controls-panel admin-card">
        <h2>三码放置区域</h2>
        <p className="muted">
          你决定主体尺寸和位置，前台固定使用；外框锁定。蓝线为主体，橙色虚线为四模块安全留白。保存草稿并发布后对新作品生效。
        </p>
        <div className="segmented" aria-label="选择固定码区域">
          {CODE_ROLES.map((role) => (
            <button
              type="button"
              key={role}
              aria-pressed={kind === role}
              className={kind === role ? "active" : ""}
              onClick={() => setKind(role)}
            >
              {CODE_NAMES[role]}
            </button>
          ))}
        </div>
        <div className="code-placement-test">
          <UploadButton label={`上传${CODE_NAMES[kind]}测试`} onFile={upload} />
          {codes[kind]?.name && (
            <span className="muted">{codes[kind]?.name}</span>
          )}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={check}
          >
            检查两个收款码
          </button>
        </div>
        <p className="muted">
          测试图片只在此页面使用，不会保存为模板素材。未上传时使用测试示例。图层可放大、移出外框，超出部分自动裁掉，外框始终显示。预览和导出使用相同的剪切蒙版。
        </p>
        {message && <p role="status">{message}</p>}
        <LayerPosition
          key={node.id}
          template={template}
          node={node}
          saved={saved?.nodes.find((n) => n.id === node.id)}
          onChange={onChange}
          previewCodes={codes}
          previewTarget={previewTarget}
        />
      </div>
      {crop && (
        <CropDialog
          src={crop.image}
          initial={crop.initial}
          defaultCrop={crop.initial}
          title="校准赞赏码取景（成品尺寸固定）"
          reward
          onClose={() => setCrop(null)}
          onConfirm={(bounds) => {
            setCodes((c) => ({
              ...c,
              reward: {
                image: crop.image,
                crop: bounds,
                name: crop.name,
                confirmed: true,
              },
            }));
            setCrop(null);
            setMessage(
              "裁剪后的赞赏码已放入固定区域，头像和图标跟随模板对齐。",
            );
          }}
        />
      )}
    </div>
  );
}
