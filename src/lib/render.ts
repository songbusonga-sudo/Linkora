import { Template, Edits, CodeKind, CodeInput, QRStyle } from "./model";
import { loadImage, makeCanvas, decodeCanvas } from "./images";
import { qrSource, presetStyle } from "./qr";
const cache = new Map<string, Promise<HTMLImageElement>>();
const fonts = new Map<string, Promise<string>>();
function fontFamily(src: string) {
  if (!fonts.has(src)) {
    const family = `LinkoraFont${fonts.size}`;
    fonts.set(
      src,
      new FontFace(family, `url(${src})`)
        .load()
        .then((font) => {
          document.fonts.add(font);
          return family;
        })
        .catch((error) => {
          fonts.delete(src);
          throw error;
        }),
    );
  }
  return fonts.get(src)!;
}
function image(src: string) {
  if (!cache.has(src)) {
    if (cache.size > 80) cache.delete(cache.keys().next().value!);
    cache.set(
      src,
      loadImage(src).catch((e) => {
        cache.delete(src);
        throw e;
      }),
    );
  }
  return cache.get(src)!;
}
export async function drawTemplate(
  t: Template,
  edits: Edits,
  codes: Partial<Record<CodeKind, CodeInput>>,
  styles: Record<"wechat" | "alipay", QRStyle>,
  scale = 1,
) {
  const c = makeCanvas(t.width * scale, t.height * scale),
    ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  let family = "sans-serif";
  if (
    t.nodes.some(
      (n) =>
        ["signature", "text"].includes(n.role) &&
        ((n.contentEditable ? edits.texts[n.id] : undefined) ??
          n.defaultText) !== (n.originalText ?? n.defaultText),
    )
  ) {
    family = await fontFamily(t.font);
  }
  const controlled = new Set(
    t.options.flatMap((o) => o.choices.flatMap((ch) => ch.nodeIds)),
  );
  const selected = new Set(
    t.options.flatMap(
      (o) =>
        o.choices.find((ch) => ch.id === (edits.choices[o.id] ?? o.defaultId))
          ?.nodeIds ?? [],
    ),
  );
  for (const n of t.nodes) {
    if (controlled.has(n.id) ? !selected.has(n.id) : !n.visible) continue;
    ctx.save();
    ctx.globalAlpha = n.opacity;
    const kind = n.role as CodeKind,
      code = codes[kind];
    let src = n.src;
    if (n.contentEditable && edits.images[n.id] && n.role !== "rewardIcon")
      src = edits.images[n.id];
    if (
      n.role === "rewardIcon" &&
      edits.images[n.id] &&
      t.assets.some(
        (a) => a.category === "rewardIcon" && a.src === edits.images[n.id],
      )
    )
      src = edits.images[n.id];
    if ((n.role === "wechat" || n.role === "alipay") && code?.content)
      src = qrSource(
        code.content,
        n.styleEditable ? styles[n.role] : presetStyle(),
      );
    if (n.role === "reward" && code?.confirmed && code.crop) {
      const im = await image(code.image);
      const tmp = makeCanvas(code.crop.size);
      tmp
        .getContext("2d")!
        .drawImage(
          im,
          code.crop.x,
          code.crop.y,
          code.crop.size,
          code.crop.size,
          0,
          0,
          tmp.width,
          tmp.height,
        );
      src = tmp.toDataURL();
    }
    const textValue =
      (n.contentEditable ? edits.texts[n.id] : undefined) ?? n.defaultText;
    if (
      (n.role === "signature" || n.role === "text") &&
      textValue !== (n.originalText ?? n.defaultText)
    ) {
      const text = Array.from(textValue).slice(0, n.maxLength).join("");
      ctx.fillStyle = n.colorEditable
        ? (edits.colors[n.id] ?? n.color)
        : n.color;
      ctx.font = `${n.fontSize}px ${family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.letterSpacing =
        n.role === "signature" ? `${n.fontSize * 0.2}px` : "0px";
      const maxWidth =
        n.role === "signature" ? Math.min(t.width - 160, 1100) : n.width;
      ctx.fillText(text, n.x + n.width / 2, n.y + n.height / 2, maxWidth);
      ctx.restore();
      continue;
    }
    const im = await image(src);
    let dx = n.x,
      dy = n.y,
      dw = n.width,
      dh = n.height;
    if (src !== n.src) {
      // The fixed white cover belongs below the replaceable artwork in the
      // supplied PSD. Keep it when an uploaded/preset image is transparent.
      // These IDs are from the first-template mapping, not user-selectable layers.
      if (n.role === "rewardAvatar" && n.id === "7-2") {
        const cover = await image("/private-assets/layer-7-2-0.png");
        ctx.drawImage(cover, n.x, n.y, n.width, n.height);
      }
      if (n.role === "rewardIcon" && n.id === "7-4") {
        const cover = await image("/private-assets/layer-7-4-0.png");
        ctx.drawImage(
          cover,
          n.x + n.width / 66,
          n.y,
          (n.width * 59) / 66,
          n.height,
        );
      }
      if (n.role === "background") {
        ctx.beginPath();
        ctx.rect(0, 0, t.width, t.height);
        ctx.clip();
        const ratio = Math.max(t.width / im.width, t.height / im.height);
        dw = im.width * ratio;
        dh = im.height * ratio;
        dx = (t.width - dw) / 2;
        dy = ((t.height - dh) * edits.backgroundY) / 100;
      }
      if (n.role === "avatar" || n.role === "rewardAvatar") {
        ctx.beginPath();
        ctx.ellipse(
          n.x + n.width / 2,
          n.y + n.height / 2,
          n.width / 2,
          n.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.clip();
      }
      if (["wechat", "alipay", "reward"].includes(n.role)) {
        const frame = t.nodes.find((f) => f.id === n.id.slice(0, -1) + "0");
        const inset = 18.05,
          x = frame ? frame.x + inset : n.x,
          y = frame ? frame.y + inset : n.y,
          w = frame ? frame.width - 2 * inset : n.width,
          h = frame ? frame.height - 2 * inset : n.height;
        ctx.beginPath();
        if (n.role === "reward")
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        else ctx.roundRect(x, y, w, h, 23);
        ctx.clip();
        if (n.role !== "reward") {
          ctx.fillStyle = "#fff";
          ctx.fillRect(n.x, n.y, n.width, n.height);
        }
      }
    }
    if (n.colorEditable) {
      const tint = makeCanvas(im.width, im.height),
        tc = tint.getContext("2d")!;
      tc.drawImage(im, 0, 0);
      tc.globalCompositeOperation = "source-in";
      tc.fillStyle = edits.colors[n.id] ?? n.color;
      tc.fillRect(0, 0, tint.width, tint.height);
      ctx.drawImage(tint, dx, dy, dw, dh);
    } else ctx.drawImage(im, dx, dy, dw, dh);
    ctx.restore();
  }
  return c;
}
export async function checkStyled(content: string, style: QRStyle) {
  const im = await image(qrSource(content, style)),
    c = makeCanvas(1024);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.drawImage(im, 0, 0, 1024, 1024);
  if (decodeCanvas(c) !== content)
    throw Error("美化后的二维码内容与原码不一致");
}
export function checkExport(
  c: HTMLCanvasElement,
  t: Template,
  codes: Partial<Record<CodeKind, CodeInput>>,
) {
  for (const role of ["wechat", "alipay"] as const) {
    const n = t.nodes.find((n) => n.role === role)!;
    const scale = c.width / t.width,
      pad = 12;
    const region = makeCanvas(
      (n.width + pad * 2) * scale,
      (n.height + pad * 2) * scale,
    );
    region
      .getContext("2d")!
      .drawImage(
        c,
        (n.x - pad) * scale,
        (n.y - pad) * scale,
        region.width,
        region.height,
        0,
        0,
        region.width,
        region.height,
      );
    if (decodeCanvas(region) !== codes[role]?.content)
      throw Error(
        `${role === "wechat" ? "微信" : "支付宝"}成品识别未通过，请调高不透明度、放大信息点或恢复默认样式`,
      );
  }
}
