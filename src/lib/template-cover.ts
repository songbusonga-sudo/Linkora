import { emptyEdits, Template } from "./model";
import { presetStyle } from "./qr";
import { drawTemplate } from "./render";

const MAX_COVER_EDGE = 720;

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(Error("模板封面生成失败"))),
      "image/png",
    ),
  );
}

// Covers are generated from the saved draft, including its default display.
// Keep them compact because this image is shown before the editable preview loads.
export async function createTemplateCover(template: Template) {
  const scale = Math.min(
    1,
    MAX_COVER_EDGE / Math.max(template.width, template.height),
  );
  const canvas = await drawTemplate(
    template,
    emptyEdits(),
    {},
    { wechat: presetStyle(), alipay: presetStyle() },
    scale,
  );
  const form = new FormData();
  form.set(
    "file",
    new File(
      [await canvasBlob(canvas)],
      `${template.name.slice(0, 60) || "template"}-cover.png`,
      { type: "image/png" },
    ),
  );
  form.set("category", "cover");
  form.set("distributable", "false");
  const response = await fetch("/api/assets", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "模板封面保存失败");
  return `/api/assets/${result.id}`;
}
