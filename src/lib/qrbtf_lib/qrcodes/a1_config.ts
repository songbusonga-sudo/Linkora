import type { QrbtfRendererA1Props } from "./a1";
export type A1PresetKeys = "a1" | "a1c" | "a1p";

export const A1Presets: Record<A1PresetKeys, QrbtfRendererA1Props> = {
  a1: {
    correct_level: "medium",
    positioning_point_type: "square",
    positioning_point_color: "#000000",
    content_point_type: "square",
    content_point_scale: 1,
    content_point_opacity: 1,
    content_point_color: "#000000",
  },
  a1c: {
    correct_level: "medium",
    content_point_type: "circle",
    positioning_point_type: "circle",
    positioning_point_color: "#000000",
    content_point_scale: 0.5,
    content_point_opacity: 0.3,
    content_point_color: "#000000",
  },
  a1p: {
    correct_level: "medium",
    content_point_type: "circle",
    positioning_point_type: "planet",
    positioning_point_color: "#000000",
    content_point_scale: 0.0,
    content_point_opacity: 1,
    content_point_color: "#000000",
  },
};
