import type { CodeKind, Template, TemplateNode } from "./model";
import { codeFrame } from "./code-placement";

export function labelLanguages(t: Template) {
  return (t.options.find((o) => o.id === "label-language")?.choices ?? []).map(
    (choice) => ({
      ...choice,
      nodes: choice.nodeIds.flatMap((id) => {
        const node = t.nodes.find((n) => n.id === id);
        return node ? [node] : [];
      }),
    }),
  );
}

const labelRoles: Record<string, CodeKind> = {
  "8-0": "wechat", "9-0": "wechat",
  "8-1": "reward", "9-3": "reward",
  "8-2": "alipay", "9-4": "alipay",
};

export function labelAnchor(t: Template, label: TemplateNode) {
  const role = labelRoles[label.id] ?? ({
    VX: "wechat", ZSM: "reward", ZFB: "alipay",
    微信: "wechat", 赞赏码: "reward", 支付宝: "alipay",
  } as Record<string, CodeKind>)[label.name.trim().toUpperCase()];
  const code = t.nodes.find((n) => n.role === role);
  return code ? codeFrame(t, code) ?? code : undefined;
}

export function alignLabels(t: Template, languageId: string, selectedId?: string) {
  const labels = labelLanguages(t).find((l) => l.id === languageId)?.nodes ?? [];
  const targets = labels.filter((n) => (!selectedId || n.id === selectedId) && labelAnchor(t, n));
  if (!targets.length) return t.nodes;
  const bottom = Math.max(...targets.map((n) => n.y + n.height));
  return t.nodes.map((n) => {
    if (!targets.some((target) => target.id === n.id)) return n;
    const anchor = labelAnchor(t, n)!;
    return {
      ...n,
      x: Math.max(-10000, Math.min(10000, anchor.x + (anchor.width - n.width) / 2)),
      y: selectedId ? n.y : Math.max(-10000, Math.min(10000, bottom - n.height)),
    };
  });
}
