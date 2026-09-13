"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TemplateNode } from "@/lib/model";
import { LAYER_PAGE_SIZE } from "@/lib/psd-folders";

export default function OptionLayerPicker({
  nodes,
  value,
  onChange,
}: {
  nodes: TemplateNode[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(nodes.length / LAYER_PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = nodes.slice(
    (currentPage - 1) * LAYER_PAGE_SIZE,
    currentPage * LAYER_PAGE_SIZE,
  );

  return (
    <div
      className="option-layer-picker"
      role="group"
      aria-label="关联图层（可多选）"
    >
      <div className="option-layer-heading">
        <strong>关联图层</strong>
        <span className="muted">
          共 {nodes.length} 个 · 已选 {value.length} 个
        </span>
      </div>
      <div className="option-layer-list">
        {visible.map((node) => (
          <label className="check-label" key={node.id}>
            <input
              type="checkbox"
              checked={value.includes(node.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, node.id]
                    : value.filter((id) => id !== node.id),
                )
              }
            />
            <span>
              {node.id} · {node.name}
            </span>
          </label>
        ))}
        {!nodes.length && (
          <p className="muted">暂无可关联图层，请先在“图层与权限”导入。</p>
        )}
      </div>
      <nav className="psd-pagination" aria-label="关联图层分页">
        <button
          type="button"
          className="secondary"
          disabled={currentPage === 1}
          onClick={() => setPage(currentPage - 1)}
        >
          <ChevronLeft size={15} />
          上一页
        </button>
        <label>
          第{" "}
          <select
            aria-label="关联图层页码"
            value={currentPage}
            onChange={(event) => setPage(Number(event.target.value))}
          >
            {Array.from({ length: pages }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {index + 1}
              </option>
            ))}
          </select>{" "}
          / {pages} 页
        </label>
        <button
          type="button"
          className="secondary"
          disabled={currentPage === pages}
          onClick={() => setPage(currentPage + 1)}
        >
          下一页
          <ChevronRight size={15} />
        </button>
      </nav>
    </div>
  );
}
