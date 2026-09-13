import type { BackgroundTransform, TemplateNode } from "./model";

export type BackgroundViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// The template's divider marks the bottom edge of the replaceable image area.
// A background must never spill into the payment-code portion below it.
export function backgroundViewport(
  canvas: { width: number; height: number },
  nodes: Pick<TemplateNode, "name" | "y">[],
): BackgroundViewport {
  const dividerY = nodes
    .filter((node) => node.name.startsWith("分割线") && node.y > 0)
    .map((node) => node.y);
  const bottom = dividerY.length ? Math.min(...dividerY) : canvas.height;
  return {
    x: 0,
    y: 0,
    width: canvas.width,
    height: Math.max(1, Math.min(canvas.height, bottom)),
  };
}

export const defaultBackgroundTransform = (): BackgroundTransform => ({
  scale: 1,
  x: 0,
  y: 0,
});

export function clampBackgroundTransform(
  value: BackgroundTransform,
): BackgroundTransform {
  const finite = (number: number, fallback: number) =>
    Number.isFinite(number) ? number : fallback;
  return {
    scale: Math.max(0.25, finite(value.scale, 1)),
    x: finite(value.x, 0),
    y: finite(value.y, 0),
    ...(value.rotation !== undefined
      ? { rotation: Math.max(-180, Math.min(180, value.rotation)) }
      : {}),
  };
}

export function clampBackgroundToViewport(
  value: BackgroundTransform,
  base: BackgroundViewport,
  canvas: { width: number; height: number },
  viewport: BackgroundViewport,
): BackgroundTransform {
  const next = clampBackgroundTransform({ ...value, scale: Math.max(1, value.scale) });
  const width = base.width * next.scale;
  const height = base.height * next.scale;
  const originX = base.x + (base.width - width) / 2;
  const originY = base.y + (base.height - height) / 2;
  const minX =
    (viewport.x + viewport.width - originX - width) / canvas.width;
  const maxX = (viewport.x - originX) / canvas.width;
  const minY =
    (viewport.y + viewport.height - originY - height) / canvas.height;
  const maxY = (viewport.y - originY) / canvas.height;
  return {
    ...next,
    x: Math.min(maxX, Math.max(minX, next.x)),
    y: Math.min(maxY, Math.max(minY, next.y)),
  };
}

// Resize from a corner while keeping the diagonally opposite corner in place.
// The background rectangle itself is centered by backgroundRect, so scaling
// also needs to move its center by half of the added size.
export function scaleBackgroundFromCorner(
  value: BackgroundTransform,
  corner: { x: -1 | 1; y: -1 | 1 },
  scale: number,
  base: { width: number; height: number },
  canvas: { width: number; height: number },
): BackgroundTransform {
  const nextScale = clampBackgroundTransform({ ...value, scale }).scale;
  const delta = nextScale - value.scale;
  const angle = ((value.rotation ?? 0) * Math.PI) / 180;
  const localX = (corner.x * base.width * delta) / 2;
  const localY = (corner.y * base.height * delta) / 2;
  const x = localX * Math.cos(angle) - localY * Math.sin(angle);
  const y = localX * Math.sin(angle) + localY * Math.cos(angle);

  return clampBackgroundTransform({
    ...value,
    scale: nextScale,
    x: value.x + x / canvas.width,
    y: value.y + y / canvas.height,
  });
}

// Preserve PSD placement. Replacements start with cover sizing, with offsets
// in canvas units shared by the editor, preview and high-resolution export.
export function backgroundRect(
  canvas: { width: number; height: number },
  node: Pick<TemplateNode, "src" | "x" | "y" | "width" | "height">,
  src: string,
  image: { width: number; height: number },
  transform?: BackgroundTransform,
  legacyY = 50,
  viewport: BackgroundViewport = {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
  },
) {
  const ratio = Math.max(
    viewport.width / image.width,
    viewport.height / image.height,
  );
  const base =
    src === node.src
      ? { x: node.x, y: node.y, width: node.width, height: node.height }
      : {
          x: viewport.x + (viewport.width - image.width * ratio) / 2,
          y:
            viewport.y +
            ((viewport.height - image.height * ratio) * legacyY) / 100,
          width: image.width * ratio,
          height: image.height * ratio,
        };
  const rawValue = transform ?? defaultBackgroundTransform();
  const value =
    base.width >= viewport.width && base.height >= viewport.height
      ? clampBackgroundToViewport(rawValue, base, canvas, viewport)
      : clampBackgroundTransform(rawValue);
  const width = base.width * value.scale,
    height = base.height * value.scale;
  return {
    x: base.x + (base.width - width) / 2 + value.x * canvas.width,
    y: base.y + (base.height - height) / 2 + value.y * canvas.height,
    width,
    height,
  };
}
