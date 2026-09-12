import type { QrbtfRendererA2Props } from "./a2";
export type A2PresetKeys = "a2" | "a2c";

export const A2Presets: Record<A2PresetKeys, QrbtfRendererA2Props> = {
  a2: {
    correct_level: "medium",
    positioning_point_type: "rounded",
    positioning_point_color: "#000000",
    content_line_type: "interlock",
    content_point_scale: 0.6,
    content_point_opacity: 1,
    content_point_color: "#000000",
  },
  a2c: {
    correct_level: "medium",
    content_line_type: "cross",
    positioning_point_type: "square",
    positioning_point_color: "#000000",
    content_point_scale: 0.6,
    content_point_opacity: 1,
    content_point_color: "#000000",
  },
};
