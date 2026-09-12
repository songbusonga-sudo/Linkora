"use client";
import { QRStyle } from "@/lib/model";
import { presetStyle } from "@/lib/qr";
import ColorField from "./color-field";
import { Reset } from "./shared";
export default function QRControls({
  style,
  onChange,
  preview,
}: {
  style: QRStyle;
  onChange: (s: QRStyle) => void;
  preview?: string;
}) {
  const update = (p: Partial<QRStyle>) => onChange({ ...style, ...p });
  return (
    <div className="qr-controls">
      <div className="field-heading">
        <label>样式系列</label>
        <Reset onClick={() => onChange(presetStyle())} />
      </div>
      <div className="segmented">
        {(["A1", "A2"] as const).map((s) => (
          <button
            key={s}
            className={style.series === s ? "active" : ""}
            onClick={() => onChange(presetStyle(s.toLowerCase()))}
          >
            {s} <span>{s === "A1" ? "点阵" : "线条"}</span>
          </button>
        ))}
      </div>
      <div className="two-fields">
        <label>
          预设
          <select
            value={style.preset}
            onChange={(e) => onChange(presetStyle(e.target.value))}
          >
            {(style.series === "A1" ? ["a1", "a1c", "a1p"] : ["a2", "a2c"]).map(
              (p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          纠错等级
          <select
            value={style.correct_level}
            onChange={(e) =>
              update({
                correct_level: e.target.value as QRStyle["correct_level"],
              })
            }
          >
            {Object.entries({
              low: "L · 7%",
              medium: "M · 15%",
              quartile: "Q · 25%",
              high: "H · 30%",
            }).map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="two-fields">
        <label>
          定位点类型
          <select
            value={style.positioning_point_type}
            onChange={(e) =>
              update({
                positioning_point_type: e.target
                  .value as QRStyle["positioning_point_type"],
              })
            }
          >
            {Object.entries({
              square: "方形",
              circle: "圆形",
              planet: "星球",
              rounded: "圆角",
            }).map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {style.series === "A1" ? (
          <label>
            信息点形状
            <select
              value={style.content_point_type}
              onChange={(e) =>
                update({
                  content_point_type: e.target
                    .value as QRStyle["content_point_type"],
                })
              }
            >
              <option value="square">方形</option>
              <option value="circle">圆形</option>
            </select>
          </label>
        ) : (
          <label>
            线条排列
            <select
              value={style.content_line_type}
              onChange={(e) =>
                update({
                  content_line_type: e.target
                    .value as QRStyle["content_line_type"],
                })
              }
            >
              {Object.entries({
                horizontal: "横向",
                vertical: "纵向",
                interlock: "交织",
                radial: "放射",
                "tl-br": "左上至右下",
                "tr-bl": "右上至左下",
                cross: "交叉",
              }).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {(["content_point_scale", "content_point_opacity"] as const).map(
        (key) => (
          <label className="range-field" key={key}>
            <span>
              {key === "content_point_scale" ? "信息点 / 线条缩放" : "不透明度"}
              <small>{Math.round(style[key] * 100)}%</small>
            </span>
            <input
              type="range"
              aria-label={
                key === "content_point_scale" ? "信息点缩放" : "信息点不透明度"
              }
              min="0"
              max="1"
              step="0.01"
              value={style[key]}
              onChange={(e) => update({ [key]: Number(e.target.value) })}
            />
          </label>
        ),
      )}
      <ColorField
        label="定位点颜色"
        value={style.positioning_point_color}
        onChange={(v) => update({ positioning_point_color: v })}
        onReset={() => update({ positioning_point_color: "#000000" })}
        preview={preview}
      />
      <ColorField
        label="信息点颜色"
        value={style.content_point_color}
        onChange={(v) => update({ content_point_color: v })}
        onReset={() => update({ content_point_color: "#000000" })}
        preview={preview}
      />
    </div>
  );
}
