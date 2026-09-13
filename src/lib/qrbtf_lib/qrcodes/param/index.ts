export interface QrbtfRendererCommonProps {
  quietModules?: number;
  correct_level: "low" | "medium" | "quartile" | "high";
}
export type RendererProps<T> = T & { url: string };
export type QrbtfModule<T> = {
  type: "svg_renderer";
  presets: Record<string, T>;
  renderer: (props: RendererProps<T>) => React.ReactNode;
};
