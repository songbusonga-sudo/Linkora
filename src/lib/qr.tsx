import { renderToStaticMarkup } from "react-dom/server";
import { qrbtfModuleA1 } from "./qrbtf_lib/qrcodes/a1";
import { qrbtfModuleA2 } from "./qrbtf_lib/qrcodes/a2";
import { A1Presets } from "./qrbtf_lib/qrcodes/a1_config";
import { A2Presets } from "./qrbtf_lib/qrcodes/a2_config";
import { QRStyle } from "./model";
export function presetStyle(preset = "a1"): QRStyle {
  const values = { ...A1Presets, ...A2Presets };
  return {
    series: preset.startsWith("a1") ? "A1" : "A2",
    preset,
    content_point_type: "square",
    content_line_type: "interlock",
    ...values[preset as keyof typeof values],
  };
}
export function qrSource(content: string, style: QRStyle) {
  const Renderer =
    style.series === "A1" ? qrbtfModuleA1.renderer : qrbtfModuleA2.renderer;
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      renderToStaticMarkup(<Renderer {...style} url={content} />),
    )
  );
}
