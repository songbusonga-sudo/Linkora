import type { Edits, QRStyle, Template, TemplateNode } from "./model";
import { isCodeFrame } from "./code-placement";

export function codeColors(t: Template, edits: Edits, style: QRStyle) {
  const frame = t.nodes.find(isCodeFrame);
  return {
    frame: edits.codeColors?.frame ?? (frame && (edits.colors[frame.id] ?? frame.color)) ?? "#bebcbc",
    ink: edits.codeColors?.ink ?? style.content_point_color,
  };
}

// Include every preset, so switching artwork retains the shared appearance.
export function rewardArtworkIds(t: Template, role: "rewardAvatar" | "rewardIcon") {
  const target = t.nodes.find((n) => n.role === role);
  return new Set([
    ...(target ? [target.id] : []),
    ...t.nodes.filter((n) => target && n.clipTo === target.id).map((n) => n.id),
    ...t.options.filter((o) => target && o.replacementNodeId === target.id)
      .flatMap((o) => o.choices.flatMap((c) => c.nodeIds)),
  ]);
}

export function unifiedQRColor(style: QRStyle, ink: string): QRStyle {
  return { ...style, content_point_color: ink, positioning_point_color: ink };
}

export function codeInkLayer(n: TemplateNode, iconIds: Set<string>) {
  return ["wechat", "alipay", "reward"].includes(n.role) || iconIds.has(n.id);
}
