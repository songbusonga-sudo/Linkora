"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FolderOpen, Plus } from "lucide-react";
import { Asset, TemplateNode } from "@/lib/model";
import {
  PsdLayer,
  LAYER_PAGE_SIZE,
  folderForLayer,
  layersInFolder,
  parentFolder,
  BACKGROUND_FOLDER,
  withBackgroundFolder,
} from "@/lib/psd-folders";

export default function LayerBrowser({
  nodes,
  layers: sourceLayers,
  assets = [],
  selectedId,
  onSelect,
  onImport,
  onAddAsset,
}: {
  nodes: TemplateNode[];
  layers: PsdLayer[];
  assets?: Asset[];
  selectedId: string;
  onSelect: (id: string) => void;
  onImport: (layer: PsdLayer) => void;
  onAddAsset?: () => void;
}) {
  const layers = useMemo(
    () => withBackgroundFolder(sourceLayers, nodes),
    [sourceLayers, nodes],
  );
  const [folder, setFolder] = useState(() =>
    folderForLayer(selectedId, layers),
  );
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const contents = layersInFolder(nodes, layers, folder);
  const pages = Math.max(1, Math.ceil(contents.length / LAYER_PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = contents.slice(
    (currentPage - 1) * LAYER_PAGE_SIZE,
    currentPage * LAYER_PAGE_SIZE,
  );
  const groups = layers.filter(
    (l) => l.kind === "group" && parentFolder(l) === folder,
  );
  const currentFolder = layers.find((l) => l.id === folder);
  const importable = layers.filter(
    (l) =>
      l.bbox[2] > l.bbox[0] &&
      l.bbox[3] > l.bbox[1] &&
      folderForLayer(l.id, layers) === folder &&
      !nodes.some((n) => n.id === l.id),
  );
  const ancestors: PsdLayer[] = [];
  let ancestor = currentFolder;
  while (ancestor && !ancestors.some((l) => l.id === ancestor!.id)) {
    ancestors.unshift(ancestor);
    ancestor = layers.find((l) => l.id === parentFolder(ancestor!));
  }

  useEffect(() => {
    if (!selectedId) return;
    const nextFolder = folderForLayer(selectedId, layers);
    const index = layersInFolder(nodes, layers, nextFolder).findIndex(
      (n) => n.id === selectedId,
    );
    setFolder(nextFolder);
    setPage(Math.max(1, Math.floor(index / LAYER_PAGE_SIZE) + 1));
  }, [selectedId, nodes, layers]);

  function openFolder(id: string) {
    setFolder(id);
    setPage(1);
    setShowImport(false);
    onSelect(layersInFolder(nodes, layers, id)[0]?.id ?? "");
  }
  function turnPage(next: number) {
    setPage(next);
    onSelect(contents[(next - 1) * LAYER_PAGE_SIZE]?.id ?? "");
  }

  return (
    <div className="admin-card psd-browser">
      <div className="section-title">
        <h2>PSD 素材</h2>
        {onAddAsset && (
          <button type="button" className="text-button" onClick={onAddAsset}>
            <Plus size={14} />
            新增素材
          </button>
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => setShowImport(!showImport)}
        >
          <Plus size={14} />
          导入图层
        </button>
      </div>
      <nav className="psd-breadcrumbs" aria-label="PSD 文件夹路径">
        <button type="button" onClick={() => openFolder("")}>
          PSD 根目录
        </button>
        {ancestors.map((l) => (
          <span key={l.id}>
            <ChevronRight size={12} />
            <button
              type="button"
              aria-current={l.id === folder ? "page" : undefined}
              onClick={() => openFolder(l.id)}
            >
              {l.name}
            </button>
          </span>
        ))}
      </nav>
      {groups.length > 0 && (
        <div className="psd-folders" aria-label="PSD 文件夹">
          {groups.map((g) => (
            <button type="button" key={g.id} onClick={() => openFolder(g.id)}>
              <FolderOpen size={17} />
              <span>{g.name}</span>
            </button>
          ))}
        </div>
      )}
      {showImport && (
        <div className="import-layers">
          <select
            aria-label="从 PSD 导入图层"
            value=""
            onChange={(e) => {
              const layer = importable.find((l) => l.id === e.target.value);
              if (layer) {
                onImport(layer);
                setShowImport(false);
              }
            }}
          >
            <option value="">选择当前文件夹中的图层…</option>
            {importable.map((l) => (
              <option key={l.id} value={l.id}>
                {l.id} · {l.name}
              </option>
            ))}
          </select>
          <p className="muted">
            仅列出当前文件夹尚未导入的图层。新图层默认隐藏；合并图层与子图层请勿重复显示。
          </p>
        </div>
      )}
      <div className="psd-folder-heading">
        <strong>{currentFolder?.name ?? "根目录图层"}</strong>
        <span>{contents.length} 项</span>
      </div>
      <div className="layer-list">
        {visible.map((n) => (
          <button
            type="button"
            key={n.id}
            className={selectedId === n.id ? "active" : ""}
            aria-pressed={selectedId === n.id}
            onClick={() => onSelect(n.id)}
          >
            <img
              className="psd-layer-thumbnail"
              src={n.src}
              alt=""
              loading="lazy"
            />
            <span>
              {n.name}
              <small>{n.id === folder ? "合并图层" : `图层 ${n.id}`}</small>
            </span>
            <span className="layer-number">{n.id}</span>
          </button>
        ))}
      </div>
      {contents.length === 0 && (
        <p className="psd-empty muted">
          此文件夹暂无已导入素材，可打开子文件夹或导入图层。
        </p>
      )}
      {folder === BACKGROUND_FOLDER && (
        <section
          className="background-folder-assets"
          aria-label="用户可选背景素材"
        >
          <div className="psd-folder-heading">
            <strong>用户可选背景</strong>
            <span>
              {assets.filter((a) => a.category === "background").length} 项
            </span>
          </div>
          <p className="muted">
            点击“新增素材”添加背景，保存并发布后用户即可选择，也可上传自己的图片。
          </p>
          <div className="preset-gallery">
            {assets
              .filter((a) => a.category === "background")
              .map((asset, index) => (
                <div className="background-asset-card" key={asset.id}>
                  <img src={asset.src} alt={asset.name} loading="lazy" />
                  <span>{index + 1}</span>
                </div>
              ))}
          </div>
        </section>
      )}
      <nav className="psd-pagination" aria-label="素材分页">
        <button
          type="button"
          className="secondary"
          aria-label="素材上一页"
          disabled={currentPage === 1}
          onClick={() => turnPage(currentPage - 1)}
        >
          <ChevronLeft size={15} />
          上一页
        </button>
        <label>
          第{" "}
          <select
            aria-label="素材页码"
            value={currentPage}
            onChange={(e) => turnPage(Number(e.target.value))}
          >
            {Array.from({ length: pages }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>{" "}
          / {pages} 页
        </label>
        <button
          type="button"
          className="secondary"
          aria-label="素材下一页"
          disabled={currentPage === pages}
          onClick={() => turnPage(currentPage + 1)}
        >
          下一页
          <ChevronRight size={15} />
        </button>
      </nav>
    </div>
  );
}
