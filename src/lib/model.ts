import { z } from "zod";
export const roleSchema = z.enum([
  "image",
  "background",
  "avatar",
  "signature",
  "wechat",
  "alipay",
  "reward",
  "rewardAvatar",
  "rewardIcon",
  "text",
]);
export const assetSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  src: z.string().regex(/^\/(private-assets\/[\w.-]+|api\/assets\/[\w.-]+)$/),
  category: z.enum([
    "background",
    "avatar",
    "rewardAvatar",
    "rewardIcon",
    "decoration",
    "font",
  ]),
  distributable: z.boolean().default(false),
});
export const nodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  src: z.string().regex(/^\/(private-assets\/[\w.-]+|api\/assets\/[\w.-]+)$/),
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
  width: z.number().positive().max(10000),
  height: z.number().positive().max(10000),
  role: roleSchema,
  visible: z.boolean(),
  opacity: z.number().min(0).max(1),
  colorEditable: z.boolean(),
  contentEditable: z.boolean(),
  styleEditable: z.boolean(),
  positionEditable: z.boolean(),
  sizeEditable: z.boolean(),
  defaultText: z.string().max(200),
  originalText: z.string().max(200).optional(),
  maxLength: z.number().int().min(1).max(200),
  fontSize: z.number().min(8).max(300),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
const optionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  defaultId: z.string(),
  choices: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        nodeIds: z.array(z.string()),
      }),
    )
    .min(1),
});
export const templateSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(80),
  description: z.string().max(200),
  width: z.number().int().min(512).max(4096),
  height: z.number().int().min(512).max(4096),
  cover: z.string().regex(/^\/(private-assets\/[\w.-]+|api\/assets\/[\w.-]+)$/),
  font: z.string().regex(/^\/(private-assets\/[\w.-]+|api\/assets\/[\w.-]+)$/),
  nodes: z.array(nodeSchema).min(3).max(200),
  options: z.array(optionSchema).max(30),
  assets: z.array(assetSchema).max(500),
  verified: z.boolean(),
  version: z.number().int().positive(),
});
export type Template = z.infer<typeof templateSchema>;
export type TemplateNode = z.infer<typeof nodeSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type CodeKind = "wechat" | "alipay" | "reward";
export type Crop = { x: number; y: number; size: number };
export type CodeInput = {
  image: string;
  content?: string;
  crop?: Crop;
  defaultCrop?: Crop;
  confirmed: boolean;
  name: string;
};
export type QRStyle = {
  preset: string;
  series: "A1" | "A2";
  correct_level: "low" | "medium" | "quartile" | "high";
  positioning_point_type: "square" | "circle" | "planet" | "rounded";
  positioning_point_color: string;
  content_point_type: "square" | "circle";
  content_line_type:
    | "horizontal"
    | "vertical"
    | "interlock"
    | "radial"
    | "tl-br"
    | "tr-bl"
    | "cross";
  content_point_scale: number;
  content_point_opacity: number;
  content_point_color: string;
};
export type Edits = {
  images: Record<string, string>;
  texts: Record<string, string>;
  colors: Record<string, string>;
  choices: Record<string, string>;
  backgroundY: number;
};
export const emptyEdits = (): Edits => ({
  images: {},
  texts: {},
  colors: {},
  choices: {},
  backgroundY: 50,
});
export function ready(codes: Partial<Record<CodeKind, CodeInput>>) {
  return !!(
    codes.wechat?.content &&
    codes.wechat.confirmed &&
    codes.alipay?.content &&
    codes.alipay.confirmed &&
    codes.reward?.crop &&
    codes.reward.confirmed
  );
}
export function validateTemplate(t: Template) {
  const ids = new Set(t.nodes.map((n) => n.id));
  if (ids.size !== t.nodes.length) throw Error("图层标识不能重复");
  for (const role of [
    "wechat",
    "alipay",
    "reward",
    "avatar",
    "background",
    "signature",
    "rewardAvatar",
    "rewardIcon",
  ])
    if (t.nodes.filter((n) => n.role === role).length !== 1)
      throw Error(`模板必须有且仅有一个 ${role} 区域`);
  for (const n of t.nodes) {
    if (Array.from(n.defaultText).length > n.maxLength)
      throw Error("默认文案超出字数上限");
    if (
      ["wechat", "alipay", "reward"].includes(n.role) &&
      (!n.visible || n.colorEditable)
    )
      throw Error("必填码必须显示，原码不允许整体颜色覆盖");
    if (n.positionEditable || n.sizeEditable)
      throw Error("第一版模板固定位置及尺寸，不向前台开放移动");
    if (n.role === "reward" && n.styleEditable)
      throw Error("赞赏码禁止二维码美化");
    if (n.role === "rewardIcon" && n.contentEditable)
      throw Error("右下图标禁止用户上传");
    if (n.role === "signature" && n.maxLength > 12)
      throw Error("署名最多 12 个字");
  }
  const optionNodes = new Set<string>();
  if (new Set(t.options.map((o) => o.id)).size !== t.options.length)
    throw Error("选项组标识不能重复");
  for (const o of t.options) {
    if (new Set(o.choices.map((c) => c.id)).size !== o.choices.length)
      throw Error("菜单项标识不能重复");
    if (!o.choices.some((c) => c.id === o.defaultId))
      throw Error("选项默认值无效");
    for (const c of o.choices) {
      for (const id of c.nodeIds) {
        if (!ids.has(id)) throw Error("选项引用了不存在的图层");
        const node = t.nodes.find((n) => n.id === id)!;
        if (!["image", "text", "rewardIcon"].includes(node.role))
          throw Error("选项不能隐藏必填码或用户内容区域");
        if (optionNodes.has(id)) throw Error("同一图层不能关联多个选项");
        optionNodes.add(id);
      }
    }
  }
  return t;
}
