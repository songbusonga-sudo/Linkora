"use client";
import { useState } from "react";
import type { Template, TemplateNode } from "@/lib/model";
import { alignLabels, labelAnchor, labelLanguages } from "@/lib/label-position";
import LayerPosition from "./layer-position";

export default function LabelPosition({ template, saved, onChange }: {
  template: Template;
  saved?: Template;
  onChange: (nodes: TemplateNode[]) => void;
}) {
  const languages = labelLanguages(template);
  const [languageId, setLanguageId] = useState("en");
  const [nodeId, setNodeId] = useState("");
  const [previewTarget, setPreviewTarget] = useState<HTMLDivElement | null>(null);
  const language = languages.find((l) => l.id === languageId) ?? languages[0];
  const node = language?.nodes.find((n) => n.id === nodeId) ?? language?.nodes[0];
  if (!language || !node) return (
    <div className="admin-card"><h2>中英文标签位置</h2>
      <p className="muted">当前模板没有可调整的中英文标签，请先在前台选项中配置二维码下方文字图层。</p>
    </div>
  );
  return (
    <div className="position-workspace label-position-workspace">
      <div className="position-preview-panel" ref={setPreviewTarget} />
      <div className="position-controls-panel">
        <section className="admin-card" aria-label="中英文标签位置设置">
          <h2>中英文标签位置</h2>
          <p className="muted">选择语言和标签，在左侧拖动或用下方坐标微调。保存草稿并发布后，前台和下载图片使用新的位置。</p>
          <div className="segmented" role="group" aria-label="调整标签语言">
            {languages.map((l) => (
              <button type="button" key={l.id} aria-pressed={l.id === language.id}
                className={l.id === language.id ? "active" : ""}
                onClick={() => { setLanguageId(l.id); setNodeId(""); }}>
                {l.name}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="选择文字图层">
            {language.nodes.map((n) => (
              <button type="button" key={n.id} aria-pressed={n.id === node.id}
                className={n.id === node.id ? "active" : ""}
                onClick={() => setNodeId(n.id)}>{n.name}</button>
            ))}
          </div>
          <div className="layer-position-actions">
            <button type="button" className="secondary" disabled={!labelAnchor(template, node)}
              onClick={() => onChange(alignLabels(template, language.id, node.id))}>
              当前标签对准二维码
            </button>
            <button type="button" className="secondary"
              disabled={!language.nodes.some((n) => labelAnchor(template, n))}
              onClick={() => onChange(alignLabels(template, language.id))}>
              {language.name}标签一键对齐
            </button>
          </div>
          <p className="muted">一键对齐将本语言标签分别居中到对应二维码外框下方，并统一底边。另一种语言的位置保持独立。</p>
          <LayerPosition key={node.id} template={template} node={node}
            saved={saved?.nodes.find((n) => n.id === node.id)}
            previewTarget={previewTarget} onChange={onChange} />
        </section>
      </div>
    </div>
  );
}
