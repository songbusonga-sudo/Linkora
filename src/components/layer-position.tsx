"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Template,
  TemplateNode,
  emptyEdits,
  CodeInput,
  CodeKind,
} from "@/lib/model";
import {
  codeFrame,
  isCodeFrame,
  qrModules,
  quietBox,
} from "@/lib/code-placement";
import {
  linkedCodeLayers,
  moveLayer,
  resizeBackground,
  resizeCode,
} from "@/lib/layer-position";
import { drawTemplate } from "@/lib/render";
import { presetStyle } from "@/lib/qr";

function Coordinate({
  label,
  value,
  disabled,
  onChange,
  min = -10000,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  min?: number;
}) {
  const displayValue = String(Number(value.toFixed(2)));
  const [input, setInput] = useState(displayValue);
  useEffect(() => setInput(displayValue), [displayValue]);
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={10000}
        step="any"
        value={input}
        disabled={disabled}
        onChange={(e) => {
          setInput(e.target.value);
          if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber))
            onChange(Math.max(min, Math.min(10000, e.target.valueAsNumber)));
        }}
        onBlur={() => setInput(displayValue)}
      />
    </label>
  );
}

export default function LayerPosition({
  template,
  node,
  saved,
  onChange,
  previewCodes,
  previewTarget,
}: {
  template: Template;
  node: TemplateNode;
  saved?: TemplateNode;
  onChange: (nodes: TemplateNode[]) => void;
  previewCodes?: Partial<Record<CodeKind, CodeInput>>;
  previewTarget?: HTMLElement | null;
}) {
  const [linked, setLinked] = useState(true);
  const resizeFrame = false;
  const canResize = ["wechat", "alipay", "reward"].includes(node.role);
  const [initialSize] = useState({ width: node.width, height: node.height });
  const scaleBase = saved ?? initialSize;
  const zoom = (node.width / scaleBase.width) * 100;
  const maxZoom = Math.min(
    300,
    Math.floor(1000000 / Math.max(scaleBase.width, scaleBase.height)),
  );
  const setZoom = (value: number) => {
    if (!Number.isFinite(value)) return;
    onChange(
      resizeBackground(
        template,
        node,
        (scaleBase.width * Math.max(10, Math.min(maxZoom, value))) / 100,
      ),
    );
  };
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    width: number;
    height: number;
    template: Template;
    node: TemplateNode;
    linked: boolean;
    corner?: [number, number];
    resizeFrame?: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const canLink = linkedCodeLayers(template, node).length > 1;
  const frame = canResize ? codeFrame(template, node) : undefined;
  const previewCode =
    previewCodes?.[node.role as CodeKind] ??
    template.defaults?.codes[node.role as CodeKind];
  let safeBox: ReturnType<typeof quietBox> | undefined;
  if (
    template.codePlacementVersion &&
    (node.role === "wechat" || node.role === "alipay") &&
    previewCode?.content
  ) {
    const style = template.defaults?.styles[node.role] ?? presetStyle();
    try {
      safeBox = quietBox(node, qrModules(previewCode.content, style));
    } catch {
      /* Rendering reports invalid content. */
    }
  }
  const x = node.fixedDashes ? (template.width - node.width) / 2 : node.x;
  const move = (nextX: number, nextY: number) =>
    onChange(moveLayer(template, node, nextX, nextY, canLink && linked));
  const dragTo = (clientX: number, clientY: number) => {
    const start = drag.current;
    if (!start) return;
    if (start.corner) {
      const dx =
        ((clientX - start.clientX) * start.template.width) / start.width;
      const dy =
        ((clientY - start.clientY) * start.template.height) / start.height;
      const width = start.node.width,
        height = start.node.height;
      const ratio = Math.max(
        0.01,
        1 +
          (2 * (dx * start.corner[0] * width + dy * start.corner[1] * height)) /
            (width * width + height * height),
      );
      onChange(
        resizeCode(
          start.template,
          start.node,
          width * ratio,
          start.resizeFrame,
        ),
      );
      return;
    }
    onChange(
      moveLayer(
        start.template,
        start.node,
        start.node.x +
          Math.round(
            ((clientX - start.clientX) * start.template.width) / start.width,
          ),
        start.node.y +
          Math.round(
            ((clientY - start.clientY) * start.template.height) / start.height,
          ),
        start.linked,
      ),
    );
  };

  useEffect(() => {
    let active = true;
    setRendering(true);
    setError("");
    // Show the selected layer even if it belongs to a non-default menu choice.
    const edits = emptyEdits();
    for (const option of template.options) {
      const choice = option.choices.find((c) => c.nodeIds.includes(node.id));
      if (choice) {
        edits.choices[option.id] = choice.id;
        if (option.replacementNodeId)
          edits.images[option.replacementNodeId] = "";
      }
    }
    drawTemplate(
      template,
      edits,
      previewCodes ?? {},
      { wechat: presetStyle(), alipay: presetStyle() },
      Math.min(1, 1000 / Math.max(template.width, template.height)),
    )
      .then((result) => {
        if (!active || !canvas.current) return;
        canvas.current.width = result.width;
        canvas.current.height = result.height;
        canvas.current.getContext("2d")!.drawImage(result, 0, 0);
        canvas.current.dataset.position = `${node.id}:${node.x}:${node.y}`;
        canvas.current.dataset.size = `${node.width}:${node.height}`;
        setRendering(false);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setRendering(false);
        }
      });
    return () => {
      active = false;
    };
  }, [template, node, previewCodes, previewTarget]);

  const preview = (
    <div className="position-preview-content">
      <div className="position-preview-heading">
        <strong>实时预览</strong>
        <span>{node.name}</span>
      </div>
      <div
        className={`layer-position-preview${dragging ? " is-dragging" : ""}`}
        style={{ aspectRatio: `${template.width} / ${template.height}` }}
        role="group"
        aria-label="拖动所选图层"
        tabIndex={0}
        onPointerDown={(e) => {
          if (isCodeFrame(node) || e.button !== 0 || drag.current) return;
          const cornerName = (e.target as Element).closest<HTMLElement>(
            "[data-resize-corner]",
          )?.dataset.resizeCorner;
          const corners: Record<string, [number, number]> = {
            nw: [-1, -1],
            ne: [1, -1],
            sw: [-1, 1],
            se: [1, 1],
          };
          const corner =
            canResize && cornerName ? corners[cornerName] : undefined;
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) * template.width) / rect.width;
          const py = ((e.clientY - rect.top) * template.height) / rect.height;
          const hit = (8 * template.width) / rect.width;
          if (
            !corner &&
            (px < x - hit ||
              px > x + node.width + hit ||
              py < node.y - hit ||
              py > node.y + node.height + hit)
          )
            return;
          e.preventDefault();
          e.currentTarget.focus({ preventScroll: true });
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            pointerId: e.pointerId,
            clientX: e.clientX,
            clientY: e.clientY,
            width: rect.width,
            height: rect.height,
            template,
            node,
            linked: canLink && linked,
            corner,
            resizeFrame,
          };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (drag.current?.pointerId === e.pointerId)
            dragTo(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (drag.current?.pointerId !== e.pointerId) return;
          dragTo(e.clientX, e.clientY);
          drag.current = null;
          setDragging(false);
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          if (drag.current) onChange(drag.current.template.nodes);
          drag.current = null;
          setDragging(false);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          setDragging(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && drag.current) {
            onChange(drag.current.template.nodes);
            drag.current = null;
            setDragging(false);
          }
          const offset = e.shiftKey ? 10 : step;
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-offset, 0],
            ArrowRight: [offset, 0],
            ArrowUp: [0, -offset],
            ArrowDown: [0, offset],
          };
          if (!drag.current && directions[e.key]) {
            e.preventDefault();
            const [dx, dy] = directions[e.key];
            move(node.x + dx, node.y + dy);
          }
        }}
      >
        <canvas ref={canvas} role="img" aria-label="图层位置实时预览" />
        {rendering && (
          <span className="position-preview-loading">正在更新预览…</span>
        )}
        <span className="layer-position-guide vertical" />
        <span className="layer-position-guide horizontal" />
        {safeBox && (
          <span
            className="code-quiet-outline"
            aria-label="四模块安全留白边界"
            style={{
              left: `${(safeBox.x / template.width) * 100}%`,
              top: `${(safeBox.y / template.height) * 100}%`,
              width: `${(safeBox.width / template.width) * 100}%`,
              height: `${(safeBox.height / template.height) * 100}%`,
            }}
          />
        )}
        <span
          className="layer-position-outline"
          style={{
            left: `${(x / template.width) * 100}%`,
            top: `${(node.y / template.height) * 100}%`,
            width: `${(node.width / template.width) * 100}%`,
            height: `${(node.height / template.height) * 100}%`,
          }}
        />
        {canResize &&
          (
            [
              ["nw", "左上", 0, 0],
              ["ne", "右上", 1, 0],
              ["sw", "左下", 0, 1],
              ["se", "右下", 1, 1],
            ] as const
          ).map(([corner, label, dx, dy]) => (
            <button
              type="button"
              key={corner}
              className={`code-resize-handle ${corner}`}
              data-resize-corner={corner}
              aria-label={`调整收款码大小（${label}）`}
              style={{
                left: `${((node.x + dx * node.width) / template.width) * 100}%`,
                top: `${((node.y + dy * node.height) / template.height) * 100}%`,
              }}
            />
          ))}
      </div>
      <p className={error ? "position-preview-warning" : "muted"} role="status">
        {error ||
          (rendering
            ? "正在更新预览…"
            : "按住蓝框内的图层即可拖动，也可用方向键微调。虚线为中心线，辅助线不会导出。")}
      </p>
      {!node.visible && (
        <p className="muted">此图层默认隐藏，预览按其所属选项显示。</p>
      )}
    </div>
  );

  if (isCodeFrame(node))
    return (
      <>
        {previewTarget ? createPortal(preview, previewTarget) : preview}
        <p className="muted">
          外框位置和大小已锁定。请到“三码放置区域”调整框内的码主体。
        </p>
      </>
    );

  return (
    <div className="layer-position">
      <h3>位置调整</h3>
      {canResize && (
        <div className="code-size-controls">
          <h3>
            {node.role === "reward"
              ? "赞赏码图层大小"
              : "二维码主体大小（不含留白）"}
          </h3>
          <div className="two-fields">
            <Coordinate
              label="收款码宽度（px）"
              min={1}
              value={node.width}
              onChange={(width) =>
                onChange(resizeCode(template, node, width, resizeFrame))
              }
            />
            <Coordinate
              label="收款码高度（px）"
              min={1}
              value={node.height}
              onChange={(height) =>
                onChange(
                  resizeCode(
                    template,
                    node,
                    (height * node.width) / node.height,
                    resizeFrame,
                  ),
                )
              }
            />
          </div>
          <div className="layer-position-actions">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onChange(resizeCode(template, node, node.width * 0.95))
              }
            >
              − 缩小码主体
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onChange(resizeCode(template, node, node.width * 1.05))
              }
            >
              ＋ 放大码主体
            </button>
          </div>
          <button
            type="button"
            className="text-button"
            disabled={!saved}
            onClick={() =>
              saved &&
              onChange(resizeCode(template, node, saved.width, resizeFrame))
            }
          >
            恢复已保存大小
          </button>
          <p className="muted">
            蓝框为{node.role === "reward"
                ? "赞赏码图层"
                : "编码主体"}
            ，可拖动四角等比缩放。允许超出外框，超出部分按剪切蒙版裁掉，外框始终显示；赞赏码覆盖层同步对齐。前台不能调整尺寸或位置。
          </p>
        </div>
      )}
      {node.role === "background" && (
        <div className="background-scale">
          <label htmlFor="background-zoom">
            背景缩放 · {Math.round(zoom * 10) / 10}%
          </label>
          <input
            id="background-zoom"
            type="range"
            min={10}
            max={maxZoom}
            step={1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <div className="layer-position-actions">
            <button
              type="button"
              className="secondary"
              disabled={zoom <= 10}
              onClick={() => setZoom(zoom - 10)}
            >
              − 缩小
            </button>
            <button
              type="button"
              className="secondary"
              disabled={zoom >= maxZoom}
              onClick={() => setZoom(zoom + 10)}
            >
              ＋ 放大
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setZoom(100)}
            >
              恢复已保存大小
            </button>
          </div>
          <p className="muted">
            保持图片比例，以背景中心缩放。100%
            为已保存大小，调整后可继续拖动取景。
          </p>
        </div>
      )}
      <div className="two-fields">
        <Coordinate
          label="横坐标 X（px）"
          value={x}
          disabled={node.fixedDashes}
          onChange={(value) => move(value, node.y)}
        />
        <Coordinate
          label="纵坐标 Y（px）"
          value={node.y}
          onChange={(value) => move(node.x, value)}
        />
      </div>
      <p className="muted">
        以画布左上角为原点，X 向右、Y 向下。
        {node.fixedDashes && "此提示文字保持水平居中，可调整上下位置。"}
      </p>
      {canLink && !canResize && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={linked}
            onChange={(e) => setLinked(e.target.checked)}
          />
          同时移动码主体及覆盖图层（外框固定）
        </label>
      )}
      <div className="layer-position-actions">
        <label>
          微调步长
          <select
            aria-label="微调步长"
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
          >
            <option value={1}>1 px</option>
            <option value={10}>10 px</option>
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          aria-label="向左移动"
          disabled={node.fixedDashes}
          onClick={() => move(node.x - step, node.y)}
        >
          ←
        </button>
        <button
          type="button"
          className="secondary"
          aria-label="向右移动"
          disabled={node.fixedDashes}
          onClick={() => move(node.x + step, node.y)}
        >
          →
        </button>
        <button
          type="button"
          className="secondary"
          aria-label="向上移动"
          onClick={() => move(node.x, node.y - step)}
        >
          ↑
        </button>
        <button
          type="button"
          className="secondary"
          aria-label="向下移动"
          onClick={() => move(node.x, node.y + step)}
        >
          ↓
        </button>
      </div>
      <div className="layer-position-actions">
        <button
          type="button"
          className="secondary"
          disabled={node.fixedDashes}
          onClick={() =>
            move(
              frame
                ? frame.x + (frame.width - node.width) / 2
                : (template.width - node.width) / 2,
              node.y,
            )
          }
        >
          水平居中
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            move(
              node.x,
              frame
                ? frame.y + (frame.height - node.height) / 2
                : (template.height - node.height) / 2,
            )
          }
        >
          垂直居中
        </button>
        <button
          type="button"
          className="text-button"
          disabled={!saved}
          onClick={() => saved && move(saved.x, saved.y)}
        >
          恢复已保存位置
        </button>
      </div>
      {previewTarget ? createPortal(preview, previewTarget) : preview}
    </div>
  );
}
