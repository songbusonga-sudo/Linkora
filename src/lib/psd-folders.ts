export type PsdLayer = {
  id: string;
  name: string;
  kind: string;
  parent?: string;
  bbox: number[];
  effectiveVisible: boolean;
  opacity: number;
  text?: string;
};

export const LAYER_PAGE_SIZE = 8;
export const BACKGROUND_FOLDER = "background-assets";

export function withBackgroundFolder(
  layers: PsdLayer[],
  nodes: { id: string; role: string }[],
): PsdLayer[] {
  const background = nodes.find((n) => n.role === "background");
  if (!background) return layers;
  const source = layers.find((l) => l.id === background.id);
  return [
    {
      id: BACKGROUND_FOLDER,
      name: "可替换背景",
      kind: "group",
      parent: "",
      bbox: [0, 0, 0, 0],
      opacity: 255,
      effectiveVisible: true,
    },
    ...layers.filter(
      (l) => l.id !== BACKGROUND_FOLDER && l.id !== background.id,
    ),
    {
      ...source,
      id: background.id,
      name: source?.name ?? "可替换背景",
      kind: source?.kind ?? "pixel",
      parent: BACKGROUND_FOLDER,
      bbox: source?.bbox ?? [0, 0, 0, 0],
      opacity: source?.opacity ?? 255,
      effectiveVisible: source?.effectiveVisible ?? true,
    },
  ];
}

export function parentFolder(layer: PsdLayer) {
  return layer.parent ?? layer.id.split("-").slice(0, -1).join("-");
}

export function folderForLayer(id: string, layers: PsdLayer[]) {
  const source = layers.find((l) => l.id === id);
  if (source?.kind === "group") return source.id;
  if (source) return parentFolder(source);
  // Derived template layers retain their PSD ID prefix.
  return (
    layers
      .filter((l) => l.kind === "group" && id.startsWith(`${l.id}-`))
      .sort((a, b) => b.id.length - a.id.length)[0]?.id ?? ""
  );
}

export function layersInFolder<T extends { id: string }>(
  nodes: T[],
  layers: PsdLayer[],
  folder: string,
) {
  return nodes.filter((n) => folderForLayer(n.id, layers) === folder);
}
