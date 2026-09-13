import encodeQR from "@paulmillr/qr";
import type { Template, TemplateNode, QRStyle } from "./model";

export const CODE_ROLES = ["wechat", "alipay", "reward"] as const;
export const CODE_NAMES = {
  wechat: "微信收款码",
  alipay: "支付宝收款码",
  reward: "赞赏码",
};
// Fixed frames from the supplied PSD. Their stroke occupies the outer 18 px.
export const FRAME_IDS = ["5-0", "6-0", "7-0"];
export const isCodeFrame = (n: TemplateNode) => FRAME_IDS.includes(n.id);
export function codeFrame(t: Template, n: TemplateNode) {
  return t.nodes.find((f) => f.id === `${n.id.split("-")[0]}-0`);
}
export function qrModules(content: string, style: QRStyle) {
  return encodeQR(content, "raw", { ecc: style.correct_level, border: 0 })
    .length;
}
export function quietBox(n: TemplateNode, modules: number) {
  const pad = (n.width * 4) / modules;
  return {
    x: n.x - pad,
    y: n.y - pad,
    width: n.width + 2 * pad,
    height: n.height + 2 * pad,
  };
}
// Only upgrade editable drafts. Published snapshots keep their original geometry.
export function upgradeCodePlacement(t: Template): Template {
  if (t.codePlacementVersion) return t;
  return {
    ...t,
    codePlacementVersion: 1,
    verified: false,
    nodes: t.nodes.map((n) => {
      if (n.role !== "wechat" && n.role !== "alipay") return n;
      const width = (Math.min(n.width, n.height) * 5) / 7;
      return {
        ...n,
        x: n.x + (n.width - width) / 2,
        y: n.y + (n.height - width) / 2,
        width,
        height: width,
      };
    }),
  };
}

export function assertFixedFrames(previous: Template, next: Template) {
  for (const frame of previous.nodes.filter(isCodeFrame)) {
    const n = next.nodes.find((n) => n.id === frame.id);
    if (
      !n ||
      ["x", "y", "width", "height", "role", "src", "visible", "opacity", "clipTo"].some(
        (key) =>
          n[key as keyof TemplateNode] !== frame[key as keyof TemplateNode],
      )
    )
      throw Error("三个码的外框固定，不能移动、缩放、隐藏、替换或删除");
  }
  if (previous.codePlacementVersion && !next.codePlacementVersion)
    throw Error("不能移除固定三码区域配置");
}

export function validateCodePlacement(t: Template) {
  if (!t.codePlacementVersion) return;
  for (const role of CODE_ROLES) {
    const n = t.nodes.find((n) => n.role === role);
    if (!n) throw Error("缺少固定码区域");
    if (role !== "reward" && Math.abs(n.width - n.height) > 0.01)
      throw Error("二维码主体必须为正方形");
    // PSD clipping masks allow the artwork to extend beyond its fixed frame.
    if (!codeFrame(t, n)) throw Error("缺少固定码框，请恢复模板码框");
  }
  for (const f of t.nodes.filter(isCodeFrame)) {
    if (t.defaults?.edits.images[f.id])
      throw Error("固定外框不能被默认素材替换");
    if (
      !f.visible ||
      f.positionEditable ||
      f.sizeEditable ||
      f.contentEditable ||
      f.styleEditable
    )
      throw Error("外框必须固定显示，不能开放编辑");
    if (t.options.some((o) => o.choices.some((c) => c.nodeIds.includes(f.id))))
      throw Error("固定外框不能设为可选图层");
  }
}
