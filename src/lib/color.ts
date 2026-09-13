export type HSV = { h: number; s: number; v: number };

export function hexToHsv(hex: string): HSV {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? (delta / max) * 100 : 0, v: max * 100 };
}

export function hsvToHex({ h, s, v }: HSV) {
  const saturation = Math.max(0, Math.min(100, s)) / 100;
  const brightness = Math.max(0, Math.min(100, v)) / 100;
  const hue = ((h % 360) + 360) % 360;
  const channel = (offset: number) => {
    const k = (offset + hue / 60) % 6;
    return Math.round(
      255 * brightness * (1 - saturation * Math.max(0, Math.min(k, 4 - k, 1))),
    )
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}
