import { Template, TemplateNode } from "./model";

// Recover the original PSD child layers, retaining the saved placement of each group.
export function editableRewardLayers(t: Template): Template {
  if (t.rewardLayersVersion === 1) return t;
  const avatar = t.nodes.find(
    (n) => n.id === "7-2" && n.role === "rewardAvatar",
  );
  const icon = t.nodes.find((n) => n.id === "7-4" && n.role === "rewardIcon");
  if (!avatar || !icon) return t;
  function child(
    group: TemplateNode,
    id: string,
    name: string,
    role: TemplateNode["role"],
    bounds: number[],
    original: number[],
    extra: Partial<TemplateNode> = {},
  ): TemplateNode {
    const [x, y, width, height] = bounds;
    return {
      ...group,
      id,
      name,
      role,
      src: `/private-assets/layer-${id}.png`,
      x: group.x + ((x - original[0]) * group.width) / original[2],
      y: group.y + ((y - original[1]) * group.height) / original[3],
      width: (width * group.width) / original[2],
      height: (height * group.height) / original[3],
      contentEditable: role === "rewardAvatar",
      colorEditable: false,
      visible: true,
      ...extra,
    };
  }
  const av = [965, 1322, 118, 118];
  const ic = [1080, 1445, 66, 59];
  const avatarNodes = [
    child(avatar, "7-2-0", "固定涂白原来头像", "image", av, av),
    child(avatar, "7-2-1", "赞赏码中心头像上传区域", "rewardAvatar", av, av),
    ...Array.from({ length: 5 }, (_, i) =>
      child(
        avatar,
        `7-2-${i + 2}`,
        `赞赏码头像${i + 1}`,
        "image",
        [966, 1324, 123, 122],
        av,
        { visible: i === 4, clipTo: "7-2-1" },
      ),
    ),
  ];
  const iconNodes = [
    child(
      icon,
      "7-4-0",
      "右下图标固定白底",
      "rewardIcon",
      [1081, 1445, 59, 59],
      ic,
    ),
    ...[
      [55, 54],
      [65, 41],
      [66, 43],
    ].map(([width, height], i) =>
      child(
        icon,
        `7-4-${i + 1}`,
        `赞赏码右下可选${i + 1}`,
        "image",
        [1080 + (66 - width) / 2, 1446 + (43 - height) / 2, width, height],
        ic,
        { visible: i === 2 },
      ),
    ),
  ];
  const nodes = t.nodes.flatMap((n) =>
    n.id === avatar.id
      ? avatarNodes
      : n.id === icon.id
        ? iconNodes
        : n.id.startsWith("7-2-") || n.id.startsWith("7-4-")
          ? []
          : [n],
  );
  const options = t.options.map((o) => ({
    ...o,
    choices: o.choices.map((c) => ({
      ...c,
      nodeIds: c.nodeIds.flatMap((id) =>
        id === "7-2" ? ["7-2-0", "7-2-1"] : id === "7-4" ? ["7-4-0"] : [id],
      ),
    })),
  }));
  options.push({
    id: "reward-avatar",
    name: "中心头像预设",
    defaultId: "7-2-6",
    replacementNodeId: "7-2-1",
    choices: avatarNodes
      .slice(2)
      .map((n) => ({ id: n.id, name: n.name, nodeIds: [n.id] })),
  });
  options.push({
    id: "reward-icon",
    name: "右下角图标",
    defaultId: "7-4-3",
    replacementNodeId: "7-4-0",
    choices: iconNodes
      .slice(1)
      .map((n) => ({ id: n.id, name: n.name, nodeIds: [n.id] })),
  });
  return { ...t, nodes, options, rewardLayersVersion: 1 };
}
