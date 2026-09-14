import { z } from "zod";
import { validateCodePlacement } from "./code-placement";
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
  fixedDashes: z.boolean().optional(),
  strokeOnly: z.boolean().optional(),
  clipTo: z.string().optional(),
  maxLength: z.number().int().min(1).max(200),
  fontSize: z.number().min(8).max(300),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
const optionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  defaultId: z.string(),
  replacementNodeId: z.string().optional(),
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
const storedImage = z
  .string()
  .regex(/^\/(private-assets\/[\w.-]+|api\/assets\/[\w.-]+)$/);
const cropSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  size: z.number().positive(),
});
export const qrStyleSchema = z.object({
  preset: z.string().max(32),
  series: z.enum(["A1", "A2"]),
  correct_level: z.enum(["low", "medium", "quartile", "high"]),
  positioning_point_type: z.enum(["square", "circle", "planet", "rounded"]),
  positioning_point_color: z.string().regex(/^#[0-9a-f]{6}$/i),
  content_point_type: z.enum(["square", "circle"]),
  content_line_type: z.enum([
    "horizontal",
    "vertical",
    "interlock",
    "radial",
    "tl-br",
    "tr-bl",
    "cross",
  ]),
  content_point_scale: z.number().min(0).max(1),
  content_point_opacity: z.number().min(0).max(1),
  content_point_color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
const defaultCodeSchema = z.object({
  image: storedImage,
  content: z.string().max(8192).optional(),
  crop: cropSchema.optional(),
  defaultCrop: cropSchema.optional(),
  confirmed: z.boolean(),
  name: z.string().max(200),
});
export const backgroundTransformSchema = z.object({
  scale: z.number().min(0.25).finite(),
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.number().min(-180).max(180).optional(),
});
export type BackgroundTransform = z.infer<typeof backgroundTransformSchema>;
export const defaultsSchema = z.object({
  edits: z.object({
    images: z.record(z.union([storedImage, z.literal("")])),
    texts: z.record(z.string().max(200)),
    colors: z.record(z.string().regex(/^#[0-9a-f]{6}$/i)),
    choices: z.record(z.string()),
    codeColors: z.object({
      frame: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
      ink: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    }).optional(),
    rewardAvatarOpacity: z.number().min(0).max(1).optional(),
    backgroundY: z.number().min(0).max(100),
    backgroundTransforms: z.record(storedImage, backgroundTransformSchema).optional(),
  }),
  codes: z.object({
    wechat: defaultCodeSchema.optional(),
    alipay: defaultCodeSchema.optional(),
    reward: defaultCodeSchema.optional(),
  }),
  styles: z.object({ wechat: qrStyleSchema, alipay: qrStyleSchema }),
});
export type TemplateDefaults = z.infer<typeof defaultsSchema>;
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
  colorDefaultsVersion: z.literal(1).optional(),
  rewardLayersVersion: z.literal(1).optional(),
  rewardColorVersion: z.literal(1).optional(),
  rewardIconColorVersion: z.literal(1).optional(),
  labelColorVersion: z.literal(1).optional(),
  codePlacementVersion: z.literal(1).optional(),
  defaults: defaultsSchema.optional(),
});
export type Template = z.infer<typeof templateSchema>;
export function selectedChoice(
  option: Template["options"][number],
  value?: string,
) {
  return (
    option.choices.find((choice) => choice.id === value) ??
    option.choices.find((choice) => choice.id === option.defaultId) ??
    option.choices[0]
  );
}
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
  codeColors?: { frame?: string; ink?: string };
  rewardAvatarOpacity?: number;
  backgroundY: number;
  backgroundTransforms?: Record<string, BackgroundTransform>;
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
  validateCodePlacement(t);
  const ids = new Set(t.nodes.map((n) => n.id));
  if (ids.size !== t.nodes.length) throw Error("图层标识不能重复");
  for (const role of ["wechat", "alipay", "reward"])
    if (t.nodes.filter((n) => n.role === role).length !== 1)
      throw Error(`模板必须有且仅有一个 ${role} 区域`);
  for (const role of [
    "avatar",
    "background",
    "signature",
    "rewardAvatar",
    "rewardIcon",
  ])
    if (t.nodes.filter((n) => n.role === role).length > 1)
      throw Error(`模板最多只能有一个 ${role} 区域`);
  for (const n of t.nodes) {
    if (n.clipTo && (!ids.has(n.clipTo) || n.clipTo === n.id))
      throw Error("图层裁切区域无效");
    if (Array.from(n.defaultText).length > n.maxLength)
      throw Error("默认文案超出字数上限");
    if (
      ["wechat", "alipay", "reward"].includes(n.role) &&
      !n.visible
    )
      throw Error("必填码必须显示");
    if (["wechat", "alipay"].includes(n.role) && n.colorEditable)
      throw Error("微信和支付宝原码不允许整体颜色覆盖");
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
    if (
      o.replacementNodeId &&
      !t.nodes.some(
        (n) =>
          n.id === o.replacementNodeId &&
          ["rewardAvatar", "rewardIcon"].includes(n.role),
      )
    )
      throw Error("预设替换区域无效");
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
