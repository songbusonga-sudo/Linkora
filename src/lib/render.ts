import {
  Template,
  Edits,
  CodeKind,
  CodeInput,
  QRStyle,
  selectedChoice,
} from "./model";
import { loadImage, makeCanvas, decodeCanvas } from "./images";
import { qrSource, presetStyle } from "./qr";
import { resolveDefaultDisplay } from "./default-display";
import { backgroundRect, backgroundViewport } from "./background-transform";
import { qrModules, quietBox, codeFrame, isCodeFrame } from "./code-placement";
import { tintRewardPixels } from "./layer-colors";
import { codeColors, codeInkLayer, rewardArtworkIds, unifiedQRColor } from "./code-appearance";
const cache = new Map<string, Promise<HTMLImageElement>>();
const fonts = new Map<string, Promise<string>>();
const tints = new Map<string, HTMLCanvasElement>();
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
  const resolved = resolveDefaultDisplay(t, edits, codes, styles);
  t = resolved.template;
  edits = resolved.edits;
  codes = resolved.codes;
  styles = resolved.styles;
  const colors = codeColors(t, edits, styles.wechat);
  styles = {
    wechat: unifiedQRColor(styles.wechat, colors.ink),
    alipay: unifiedQRColor(styles.alipay, colors.ink),
  };
  const iconIds = rewardArtworkIds(t, "rewardIcon");
  const avatarIds = rewardArtworkIds(t, "rewardAvatar");
  const c = makeCanvas(t.width * scale, t.height * scale),
    ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  // Load the editable font with the template, before the first keystroke.
  void fontFamily(t.font).catch(() => {});
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
    t.options.flatMap((o) => {
      const target = t.nodes.find((n) => n.id === o.replacementNodeId);
      const replacement = target && edits.images[target.id];
      const replacesChoice =
        replacement &&
        (target.contentEditable ||
          (target.role === "rewardIcon" &&
            t.assets.some(
              (a) => a.category === "rewardIcon" && a.src === replacement,
            )));
      return replacesChoice
        ? []
        : selectedChoice(o, edits.choices[o.id]).nodeIds;
    }),
  );
  const visibleNodes = t.nodes.filter((n) =>
    controlled.has(n.id) ? selected.has(n.id) : n.visible,
  );
  // Fetch the initial preview's visible layers concurrently. We still draw in
  // PSD order, but no longer serialize each image download on first render.
  const preload = new Set<string>();
  for (const n of visibleNodes) {
    const kind = n.role as CodeKind;
    const code = codes[kind];
    const textValue =
      (n.contentEditable ? edits.texts[n.id] : undefined) ?? n.defaultText;
    if (
      (n.role === "signature" || n.role === "text") &&
      textValue !== (n.originalText ?? n.defaultText)
    )
      continue;
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
    if ((n.role === "wechat" || n.role === "alipay") && code?.content) {
      const style =
        n.styleEditable || t.defaults
          ? styles[n.role]
          : unifiedQRColor(presetStyle(), colors.ink);
      src = qrSource(
        code.content,
        style,
        t.codePlacementVersion ? 4 : undefined,
      );
    }
    if (n.role === "reward" && code?.confirmed && code.crop) src = code.image;
    preload.add(src);
    if (src !== n.src && n.role === "rewardAvatar" && n.id === "7-2")
      preload.add("/private-assets/layer-7-2-0.png");
    if (src !== n.src && n.role === "rewardIcon" && n.id === "7-4")
      preload.add("/private-assets/layer-7-4-0.png");
  }
  await Promise.all(Array.from(preload, image));
  for (const n of visibleNodes) {
    ctx.save();
    ctx.globalAlpha = n.opacity * (avatarIds.has(n.id) ? (edits.rewardAvatarOpacity ?? 1) : 1);
    // Apply the PSD group mask before any backing, generated code or overlay.
    // The frame itself stays outside this mask, so artwork cannot cover its stroke.
    if (
      ["wechat", "alipay", "reward"].includes(n.role) ||
      (n.id.startsWith("7-") && !isCodeFrame(n))
    ) {
      const frame = codeFrame(t, n);
      if (frame) {
        const round = frame.id === "7-0";
        const sx = frame.width / 371,
          sy = frame.height / (round ? 371 : 372),
          x = frame.x + 18.05 * sx,
          y = frame.y + 18.05 * sy,
          w = frame.width - 36.1 * sx,
          h = frame.height - 36.1 * sy;
        ctx.beginPath();
        if (round)
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        else ctx.roundRect(x, y, w, h, 23 * Math.min(sx, sy));
        ctx.clip();
      }
      if (n.role === "wechat" || n.role === "alipay") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(n.x, n.y, n.width, n.height);
      }
    }
    if (n.clipTo) {
      const clip = t.nodes.find((other) => other.id === n.clipTo);
      if (clip) {
        ctx.beginPath();
        if (clip.role === "rewardAvatar")
          ctx.rect(clip.x, clip.y, clip.width, clip.height);
        else
          ctx.ellipse(
            clip.x + clip.width / 2,
            clip.y + clip.height / 2,
            clip.width / 2,
            clip.height / 2,
            0,
            0,
            Math.PI * 2,
          );
        ctx.clip();
      }
    }
    const kind = n.role as CodeKind,
      code = codes[kind];
    let src = n.src;
    let cropped: HTMLCanvasElement | undefined;
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
    let generatedBox: ReturnType<typeof quietBox> | undefined;
    if ((n.role === "wechat" || n.role === "alipay") && code?.content) {
      const style =
        n.styleEditable || t.defaults
          ? styles[n.role]
          : unifiedQRColor(presetStyle(), colors.ink);
      if (t.codePlacementVersion) {
        const modules = qrModules(code.content, style);
        generatedBox = quietBox(n, modules);
      }
      src = qrSource(
        code.content,
        style,
        t.codePlacementVersion ? 4 : undefined,
      );
    }
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
      cropped = tmp;
      src = code.image;
    }
    const textValue =
      (n.contentEditable ? edits.texts[n.id] : undefined) ?? n.defaultText;
    if (
      (n.role === "signature" || n.role === "text") &&
      textValue !== (n.originalText ?? n.defaultText)
    ) {
      const body = Array.from(textValue).slice(0, n.maxLength).join("");
      const text = n.fixedDashes ? `-${body}-` : body;
      ctx.fillStyle = n.colorEditable
        ? (edits.colors[n.id] ?? n.color)
        : n.color;
      ctx.font = `${n.fontSize}px ${family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.letterSpacing =
        n.role === "signature" || n.fixedDashes
          ? `${n.fontSize * 0.2}px`
          : "0px";
      const maxWidth = n.fixedDashes
        ? t.width - 320
        : n.role === "signature"
          ? Math.min(t.width - 160, 1100)
          : n.width;
      ctx.fillText(
        text,
        // Signatures are a user-facing identity element: their visual centre
        // stays on the template centreline regardless of text length or the
        // source layer's original bounds.
        n.role === "signature" || n.fixedDashes
          ? t.width / 2
          : n.x + n.width / 2,
        n.y + n.height / 2,
        maxWidth,
      );
      ctx.restore();
      continue;
    }
    const im = cropped ?? (await image(src));
    let dx = n.fixedDashes ? t.width / 2 - n.width / 2 : n.x,
      dy = n.y,
      dw = n.width,
      dh = n.height;
    if (generatedBox) {
      ({ x: dx, y: dy, width: dw, height: dh } = generatedBox);
      ctx.fillStyle = "#fff";
      ctx.fillRect(dx, dy, dw, dh);
    } else if (
      t.codePlacementVersion &&
      (n.role === "wechat" || n.role === "alipay")
      && !code?.content
    ) {
      // Keep the original PSD placeholder appearance until a real code is supplied.
      dw = n.width * 1.4;
      dh = n.height * 1.4;
      dx = n.x - n.width * 0.2;
      dy = n.y - n.height * 0.2;
    }
    if (n.role === "reward" && cropped) {
      // Screenshot crop dimensions never determine the destination size.
      dw = dh = Math.min(n.width, n.height);
      dx = n.x + (n.width - dw) / 2;
      dy = n.y + (n.height - dh) / 2;
    }
    if (n.id === "7-3" && src === "/private-assets/layer-7-3.png") {
      // Extend only the upper fixed badge cover, retaining its round alpha mask.
      // PSD units: 6 px above, 1 px on each side, with the bottom edge fixed.
      // Scale with the saved layer geometry so preview and export stay aligned.
      dx -= n.width / 59;
      dy -= (n.height * 6) / 59;
      dw += (n.width * 2) / 59;
      dh += (n.height * 6) / 59;
    }
    if (cropped || src !== n.src) {
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
      if (n.role === "avatar" || n.role === "rewardAvatar") {
        ctx.beginPath();
        if (n.role === "rewardAvatar") ctx.rect(n.x, n.y, n.width, n.height);
        else
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
        const ratio = Math.max(n.width / im.width, n.height / im.height);
        dw = im.width * ratio;
        dh = im.height * ratio;
        dx = n.x + (n.width - dw) / 2;
        dy = n.y + (n.height - dh) / 2;
      }
    }
    if (n.role === "background") {
      const transform = edits.backgroundTransforms?.[src];
      const viewport = backgroundViewport(t, t.nodes);
      const rect = backgroundRect(
        t,
        n,
        src,
        im,
        transform,
        transform ? 50 : edits.backgroundY,
        viewport,
      );
      ({ x: dx, y: dy, width: dw, height: dh } = rect);
      ctx.beginPath();
      ctx.rect(viewport.x, viewport.y, viewport.width, viewport.height);
      ctx.clip();
    }
    const inkLayer = codeInkLayer(n, iconIds);
    const generatedCode =
      (n.role === "wechat" || n.role === "alipay") && !!code?.content;
    if (!generatedCode && (inkLayer || isCodeFrame(n) || n.colorEditable)) {
      const color = inkLayer ? colors.ink : isCodeFrame(n) ? colors.frame : (edits.colors[n.id] ?? n.color);
      const key = JSON.stringify([
        src,
        n.role,
        color,
        n.strokeOnly,
        n.id === "7-0",
        n.width,
        n.height,
      ]);
      let tint = cropped ? undefined : tints.get(key);
      if (!tint) {
        tint = makeCanvas(im.width, im.height);
        const tc = tint.getContext("2d")!;
        tc.drawImage(im, 0, 0);
        if (inkLayer) {
          const pixels = tc.getImageData(0, 0, tint.width, tint.height);
          tintRewardPixels(pixels.data, color);
          tc.putImageData(pixels, 0, 0);
        } else {
          tc.globalCompositeOperation = "source-in";
          tc.fillStyle = color;
          tc.fillRect(0, 0, tint.width, tint.height);
        }
        if (n.strokeOnly) {
          // Only the frame's outer stroke is tinted; the QR backing stays white.
          tc.globalCompositeOperation = "source-over";
          tc.fillStyle = "#ffffff";
          tc.save();
          const inset = 18.05;
          tc.beginPath();
          if (n.id === "7-0")
            tc.ellipse(
              im.width / 2,
              im.height / 2,
              im.width / 2 - inset,
              im.height / 2 - inset,
              0,
              0,
              Math.PI * 2,
            );
          else
            tc.roundRect(
              inset,
              inset,
              im.width - 2 * inset,
              im.height - 2 * inset,
              23,
            );
          tc.fill();
          tc.restore();
        }
        if (!cropped) {
          if (tints.size >= 24) tints.delete(tints.keys().next().value!);
          tints.set(key, tint);
        }
      }
      ctx.drawImage(tint, dx, dy, dw, dh);
    } else {
      ctx.drawImage(im, dx, dy, dw, dh);
      if (
        n.role === "background" &&
        src === "/private-assets/layer-0.png" &&
        im.width === 4506 &&
        im.height === 2047
      ) {
        // The original starlight raster has a dark border in its first three
        // rows. Extend the adjacent clean row without moving the artwork.
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(im, 0, 3, im.width, 1, dx, dy, dw, (dh * 3) / im.height);
      }
    }
    ctx.restore();
  }
  return c;
}
export async function checkStyled(content: string, style: QRStyle) {
  const im = await image(qrSource(content, style, 4)),
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
  styles?: Record<"wechat" | "alipay", QRStyle>,
) {
  for (const role of ["wechat", "alipay"] as const) {
    if (!codes[role]?.content) continue;
    const n = t.nodes.find((n) => n.role === role)!;
    const scale = c.width / t.width,
      pad =
        t.codePlacementVersion && codes[role]?.content
          ? (n.width * 4) /
            qrModules(
              codes[role]!.content!,
              styles?.[role] ?? t.defaults?.styles[role] ?? presetStyle(),
            )
          : 12;
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
    let decoded: string;
    try {
      decoded = decodeCanvas(region);
    } catch {
      throw Error(
        `${role === "wechat" ? "微信" : "支付宝"}成品识别未通过，请恢复默认样式后重试`,
      );
    }
    if (decoded !== codes[role]?.content)
      throw Error(
        `${role === "wechat" ? "微信" : "支付宝"}成品识别未通过，请调高不透明度、放大信息点或恢复默认样式`,
      );
  }
}
