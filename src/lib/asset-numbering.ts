import type { Asset } from "./model";

export function nextAssetNumber(assets: Asset[], category: Asset["category"]) {
  const sameCategory = assets.filter((asset) => asset.category === category);
  return (
    Math.max(
      sameCategory.length,
      ...sameCategory.map((asset) => {
        const number = /^\d+$/.test(asset.name) ? Number(asset.name) : 0;
        return Number.isSafeInteger(number) ? number : 0;
      }),
    ) + 1
  );
}
