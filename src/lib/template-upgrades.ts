import { Template, TemplateNode } from "./model";
import {
  defaultLayerColors,
  editableRewardColor,
  editableRewardIconColor,
} from "./layer-colors";
import { editableRewardLayers } from "./reward-layers";

// Expand the original PSD's flattened footer on read without rewriting history.
export function editableFooter(t: Template): Template {
  // Remove the unsupported synthetic WeChat/Alipay avatar settings from older drafts.
  if (t.defaults) t = { ...t, defaults: { ...t.defaults, edits: { ...t.defaults.edits,
    images: Object.fromEntries(Object.entries(t.defaults.edits.images).filter(([id]) =>
      !["code-avatar-wechat", "code-avatar-alipay"].includes(id))),
  } } };
  const group = t.nodes.find(
    (n) =>
      n.id === "9" &&
      n.role === "image" &&
      n.src === "/private-assets/layer-9.png",
  );
  let nodes = t.nodes;
  if (group && !nodes.some((n) => n.id.startsWith("9-"))) {
    const layers = [
      { id: "9-0", name: "VX", x: 416, y: 1628, width: 72, height: 38 },
      { id: "9-1", name: "付款提示", x: 785, y: 1792, width: 473, height: 33 },
      {
        id: "9-2",
        name: "联系与工作时间",
        x: 562,
        y: 1866,
        width: 923,
        height: 33,
      },
      { id: "9-3", name: "ZSM", x: 964, y: 1627, width: 122, height: 40 },
      { id: "9-4", name: "ZFB", x: 1552, y: 1629, width: 108, height: 38 },
    ];
    const children: TemplateNode[] = layers.map((layer) => ({
      ...group,
      ...layer,
      src: `/private-assets/layer-${layer.id}.png`,
      x: group.x + layer.x - 416,
      y: group.y + layer.y - 1627,
    }));
    nodes = nodes.flatMap((n) => (n === group ? children : [n]));
    t = {
      ...t,
      options: t.options.map((o) => ({
        ...o,
        choices: o.choices.map((c) => ({
          ...c,
          nodeIds: c.nodeIds.flatMap((id) =>
            id === group.id ? children.map((n) => n.id) : [id],
          ),
        })),
      })),
    };
  }
  return editableRewardIconColor(editableRewardColor(editableRewardLayers(defaultLayerColors({
    ...t,
    nodes: nodes.map((n) => {
      if (
        n.role !== "image" ||
        n.src !== `/private-assets/layer-${n.id}.png` ||
        !["9-1", "9-2"].includes(n.id)
      )
        return n;
      const text =
        n.id === "9-1"
          ? "付款后请截图，谢谢宝宝"
          : "遇到问题请及时联系我，工作时间为9:00-18:00";
      return {
        ...n,
        name: n.id === "9-1" ? "付款提示" : "联系与工作时间",
        role: "text",
        contentEditable: true,
        fixedDashes: true,
        x: t.width / 2 - n.width / 2,
        defaultText: text,
        originalText: text,
        maxLength: 60,
        fontSize: 42,
        color: "#bfbfbf",
      };
    }),
  }))));
}
