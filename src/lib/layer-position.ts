import { Template, TemplateNode } from "./model";
import { isCodeFrame } from "./code-placement";

export function resizeBackground(
  t: Template,
  node: TemplateNode,
  width: number,
) {
  if (node.role !== "background" || !Number.isFinite(width) || width <= 0)
    return t.nodes;
  const ratio = node.height / node.width;
  const nextWidth = Math.max(
    Math.max(1, 1 / ratio),
    Math.min(width, 10000, 10000 / ratio),
  );
  const nextHeight = nextWidth * ratio;
  return t.nodes.map((n) =>
    n.id === node.id
      ? {
          ...n,
          width: nextWidth,
          height: nextHeight,
          x: Math.max(-10000, Math.min(10000, n.x + (n.width - nextWidth) / 2)),
          y: Math.max(
            -10000,
            Math.min(10000, n.y + (n.height - nextHeight) / 2),
          ),
        }
      : n,
  );
}

export function linkedCodeLayers(t: Template, node: TemplateNode) {
  // The supplied PSD keeps each code, frame and overlays in one numbered group.
  const prefix = node.id.match(/^[567]-/)?.[0];
  if (!prefix || !["image", "wechat", "alipay", "reward"].includes(node.role))
    return [node];
  const group = t.nodes.filter(
    (n) => n.id.startsWith(prefix) && !isCodeFrame(n),
  );
  return group.some((n) => ["wechat", "alipay", "reward"].includes(n.role))
    ? group
    : [node];
}

export function codeResizeLayers(
  t: Template,
  node: TemplateNode,
  _includeFrame = false,
) {
  if (!["wechat", "alipay", "reward"].includes(node.role)) return [];
  const prefix = node.id.split("-")[0] + "-";
  return t.nodes.filter(
    (n) =>
      n.id === node.id ||
      (n.id.startsWith(prefix) && node.role === "reward" && !isCodeFrame(n)),
  );
}

export function resizeCode(
  t: Template,
  node: TemplateNode,
  width: number,
  includeFrame = false,
) {
  if (!Number.isFinite(width) || width <= 0) return t.nodes;
  const group = codeResizeLayers(t, node, includeFrame);
  if (!group.length) return t.nodes;
  const cx = node.x + node.width / 2,
    cy = node.y + node.height / 2;
  let maxScale = Infinity,
    minScale = 0;
  for (const n of group) {
    maxScale = Math.min(maxScale, 10000 / n.width, 10000 / n.height);
    minScale = Math.max(minScale, 1 / n.width, 1 / n.height);
    for (const [center, position] of [
      [cx, n.x],
      [cy, n.y],
    ]) {
      const delta = position - center;
      if (delta > 0) maxScale = Math.min(maxScale, (10000 - center) / delta);
      if (delta < 0) maxScale = Math.min(maxScale, (-10000 - center) / delta);
    }
  }
  const scale = Math.max(minScale, Math.min(width / node.width, maxScale));
  const ids = new Set(group.map((n) => n.id));
  return t.nodes.map((n) =>
    ids.has(n.id)
      ? {
          ...n,
          x: cx + (n.x - cx) * scale,
          y: cy + (n.y - cy) * scale,
          width: n.width * scale,
          height: n.height * scale,
        }
      : n,
  );
}

export function moveLayer(
  t: Template,
  node: TemplateNode,
  x: number,
  y: number,
  linked = false,
) {
  if (isCodeFrame(node)) return t.nodes;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return t.nodes;
  const moving =
    node.role === "reward"
      ? codeResizeLayers(t, node)
      : linked
        ? linkedCodeLayers(t, node)
        : [node];
  const dx = node.fixedDashes
    ? 0
    : Math.max(
        ...moving.map((n) => -10000 - n.x),
        Math.min(x - node.x, ...moving.map((n) => 10000 - n.x)),
      );
  const dy = Math.max(
    ...moving.map((n) => -10000 - n.y),
    Math.min(y - node.y, ...moving.map((n) => 10000 - n.y)),
  );
  const ids = new Set(moving.map((n) => n.id));
  return t.nodes.map((n) =>
    ids.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n,
  );
}
