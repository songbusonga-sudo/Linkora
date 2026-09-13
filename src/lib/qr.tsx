import { renderToStaticMarkup } from "react-dom/server";
import { qrbtfModuleA1 } from "./qrbtf_lib/qrcodes/a1";
import { qrbtfModuleA2 } from "./qrbtf_lib/qrcodes/a2";
import { A1Presets } from "./qrbtf_lib/qrcodes/a1_config";
import { A2Presets } from "./qrbtf_lib/qrcodes/a2_config";
import { QRStyle } from "./model";
export function presetStyle(preset = "a1"): QRStyle {
  // Old template snapshots may still contain the removed A2C preset.
  // Render them as the supported A2 preset instead.
  if (preset === "a2c") preset = "a2";
  const values = { ...A1Presets, ...A2Presets };
  return {
    series: preset.startsWith("a1") ? "A1" : "A2",
    preset,
    content_point_type: "square",
    content_line_type: "interlock",
    ...values[preset as keyof typeof values],
  };
}
export function restyleQR(style: QRStyle, preset = "a1"): QRStyle {
  return {
    ...presetStyle(preset),
    content_point_color: style.content_point_color,
    positioning_point_color: style.content_point_color,
  };
}
const sources = new Map<string, string>();
export function qrSource(content: string, style: QRStyle, quietModules?: number) {
  const effectiveStyle =
    style.preset === "a2c" ? restyleQR(style, "a2") : style;
  const key = JSON.stringify([content, effectiveStyle, quietModules]);
  const cached = sources.get(key);
  if (cached) return cached;
  const Renderer =
    effectiveStyle.series === "A1"
      ? qrbtfModuleA1.renderer
      : qrbtfModuleA2.renderer;
  const source =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      renderToStaticMarkup(
        <Renderer {...effectiveStyle} url={content} quietModules={quietModules} />,
      ),
    );
  if (sources.size >= 32) sources.delete(sources.keys().next().value!);
  sources.set(key, source);
  return source;
}
