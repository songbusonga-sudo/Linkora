import { Template, TemplateNode } from "./model";

export function defaultLayerColor(n: TemplateNode): TemplateNode {
  const psdSource = n.src === `/private-assets/layer-${n.id}.png`;
  if (psdSource && n.role === "image" && (/^3-\d+$/.test(n.id) || n.id === "4"))
    return { ...n, colorEditable: true, color: "#a0a0a0" };
  if (psdSource && n.role === "image" && ["5-0", "6-0", "7-0"].includes(n.id))
    return { ...n, colorEditable: true, color: "#bebcbc", strokeOnly: true };
  if (n.role === "signature" || (n.role === "text" && n.fixedDashes))
    return { ...n, colorEditable: true, color: "#bebcbc" };
  return n;
}

export function defaultLayerColors(t: Template): Template {
  if (t.colorDefaultsVersion === 1) return t;
  return {
    ...t,
    colorDefaultsVersion: 1,
    nodes: t.nodes.map(defaultLayerColor),
  };
}

export function editableRewardColor(t: Template): Template {
  if (t.rewardColorVersion === 1) return t;
  return {
    ...t,
    rewardColorVersion: 1,
    nodes: t.nodes.map((n) => n.role === "reward"
      ? { ...n, colorEditable: true, color: n.colorEditable ? n.color : "#000000" }
      : n),
  };
}

// The right-bottom reward icon is artwork rather than the QR itself. Mark its
// white backing and every selectable artwork layer independently so a chosen
// icon can retain its own overlay colour.
export function editableRewardIconColor(t: Template): Template {
  if (t.rewardIconColorVersion === 1) return t;
  const icon = t.nodes.find((n) => n.role === "rewardIcon");
  if (!icon) return t;
  const option = t.options.find((o) => o.replacementNodeId === icon.id);
  const ids = new Set([
    icon.id,
    ...(option?.choices.flatMap((choice) => choice.nodeIds) ?? []),
  ]);
  return {
    ...t,
    rewardIconColorVersion: 1,
    nodes: t.nodes.map((n) =>
      ids.has(n.id)
        ? {
            ...n,
            colorEditable: true,
            color: n.colorEditable ? n.color : "#000000",
          }
        : n,
    ),
  };
}

// The Chinese and English code captions are selectable image layers.  Give
// every language choice its own overlay so switching language never loses the
// colour setting for that caption.
export function editableLabelColor(t: Template): Template {
  if (t.labelColorVersion === 1) return t;
  const option = t.options.find((candidate) => candidate.id === "label-language");
  if (!option) return t;
  const ids = new Set(option.choices.flatMap((choice) => choice.nodeIds));
  return {
    ...t,
    labelColorVersion: 1,
    nodes: t.nodes.map((n) =>
      ids.has(n.id)
        ? { ...n, colorEditable: true, color: n.colorEditable ? n.color : "#a0a0a0" }
        : n,
    ),
  };
}

// Uploaded screenshots contain opaque white pixels. Tint their ink by
// luminance instead of filling their entire alpha, retaining white and edges.
export function tintRewardPixels(data: Uint8ClampedArray, color: string, normalizePreset = false) {
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  // Preset artwork is already gray. Map its darkest opaque ink to the chosen
  // colour, retaining white details and alpha, rather than tinting gray twice.
  let inkRange = normalizePreset ? 0 : 1;
  if (normalizePreset) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      inkRange = Math.max(inkRange,
        1 - (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255);
    }
    if (inkRange < 1 / 255) return;
  }
  for (let i = 0; i < data.length; i += 4) {
    const ink = Math.min(1, (1 - (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255) / inkRange);
    for (let channel = 0; channel < 3; channel++)
      data[i + channel] = 255 - (255 - rgb[channel]) * ink;
  }
}
