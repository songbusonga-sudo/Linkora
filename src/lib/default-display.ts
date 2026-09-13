import { CodeInput, CodeKind, Edits, QRStyle, Template } from "./model";

// Template defaults are administrator-authored; user overrides still obey layer permissions.
export function resolveDefaultDisplay(
  t: Template,
  edits: Edits,
  codes: Partial<Record<CodeKind, CodeInput>>,
  styles: Record<"wechat" | "alipay", QRStyle>,
) {
  const defaults = t.defaults;
  if (!defaults) return { template: t, edits, codes, styles };
  const allowed = (key: "images" | "texts" | "colors") =>
    Object.fromEntries(
      Object.entries(edits[key]).filter(([id]) => {
        const n = t.nodes.find((n) => n.id === id);
        return (
          n &&
          (key === "colors"
            ? n.colorEditable
            : n.contentEditable || n.role === "rewardIcon")
        );
      }),
    );
  const effectiveEdits = {
    codeColors: { ...defaults.edits.codeColors, ...edits.codeColors },
    rewardAvatarOpacity: edits.rewardAvatarOpacity ?? defaults.edits.rewardAvatarOpacity,
    images: { ...defaults.edits.images, ...allowed("images") },
    texts: { ...defaults.edits.texts, ...allowed("texts") },
    colors: { ...defaults.edits.colors, ...allowed("colors") },
    choices: { ...defaults.edits.choices, ...edits.choices },
    backgroundTransforms: {
      ...defaults.edits.backgroundTransforms,
      ...(t.nodes.find((n) => n.role === "background")?.contentEditable
        ? edits.backgroundTransforms : {}),
    },
    backgroundY: t.nodes.some((n) => n.role === "background" && n.contentEditable && edits.images[n.id] !== undefined)
      ? edits.backgroundY
      : defaults.edits.backgroundY,
  };
  const template = {
    ...t,
    nodes: t.nodes.map((n) => ({
      ...n,
      contentEditable:
        n.contentEditable ||
        !!defaults.edits.images[n.id] ||
        defaults.edits.texts[n.id] !== undefined,
      color: defaults.edits.colors[n.id] ?? n.color,
    })),
  };
  return {
    template,
    edits: effectiveEdits,
    codes: { ...defaults.codes, ...codes },
    styles: {
      wechat:
        codes.wechat && t.nodes.find((n) => n.role === "wechat")?.styleEditable
          ? styles.wechat
          : defaults.styles.wechat,
      alipay:
        codes.alipay && t.nodes.find((n) => n.role === "alipay")?.styleEditable
          ? styles.alipay
          : defaults.styles.alipay,
    },
  };
}
