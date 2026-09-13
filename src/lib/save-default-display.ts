import { Asset, Template } from "./model";

export async function uploadTemplateAsset(
  file: File,
  category: Asset["category"],
): Promise<Asset> {
  const form = new FormData();
  form.set("file", file);
  form.set("category", category);
  form.set("distributable", "false");
  const response = await fetch("/api/assets", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "素材上传失败");
  return {
    id: result.id,
    name: file.name.slice(0, 100),
    src: `/api/assets/${result.id}`,
    category,
    distributable: false,
  };
}

// Keep browser data URLs out of template snapshots; each uploaded image becomes a registered asset.
export async function persistDefaultDisplay(
  t: Template,
  cache: Map<string, Asset>,
) {
  if (!t.defaults) return t;
  const defaults = structuredClone(t.defaults),
    assets = [...t.assets];
  async function store(src: string, name: string, category: Asset["category"]) {
    if (!src.startsWith("data:image/")) return src;
    let asset = cache.get(src);
    if (!asset) {
      const blob = await fetch(src).then((r) => r.blob());
      asset = await uploadTemplateAsset(
        new File([blob], `${name}.png`, { type: blob.type }),
        category,
      );
      cache.set(src, asset);
    }
    if (!assets.some((a) => a.id === asset.id)) assets.push(asset);
    return asset.src;
  }
  if (defaults.edits.backgroundTransforms) {
    const transforms: NonNullable<typeof defaults.edits.backgroundTransforms> = {};
    for (const [src, transform] of Object.entries(defaults.edits.backgroundTransforms)) {
      transforms[await store(src, "背景", "background")] = transform;
    }
    defaults.edits.backgroundTransforms = transforms;
  }
  for (const [id, src] of Object.entries(defaults.edits.images)) {
    const node = t.nodes.find((n) => n.id === id);
    if (!node) { delete defaults.edits.images[id]; continue; }
    const category =
      node &&
      ["background", "avatar", "rewardAvatar", "rewardIcon"].includes(node.role)
        ? (node.role as Asset["category"])
        : "avatar";
    defaults.edits.images[id] = await store(
      src,
      node?.name ?? "码中头像",
      category,
    );
  }
  for (const code of Object.values(defaults.codes))
    if (code)
      code.image = await store(
        code.image,
        code.name.replace(/\.[^.]+$/, ""),
        "decoration",
      );
  return { ...t, defaults, assets };
}
