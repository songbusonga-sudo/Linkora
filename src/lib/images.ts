import {
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  MultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";
import type { Crop } from "./model";
export async function loadImage(src: string): Promise<HTMLImageElement> {
  const im = new Image();
  im.decoding = "async";
  im.src = src;
  await im.decode();
  return im;
}
export function makeCanvas(width: number, height = width) {
  const c = document.createElement("canvas");
  c.width = Math.round(width);
  c.height = Math.round(height);
  return c;
}
export async function readImage(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw Error("请上传 PNG、JPG 或 WebP 图片");
  if (file.size > 20 * 1024 * 1024) throw Error("图片不能超过 20 MB");
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImage(url);
    if (im.width * im.height > 40_000_000)
      throw Error("图片尺寸过大，请使用原始截图");
    const ratio = Math.min(1, 4096 / Math.max(im.width, im.height));
    const c = makeCanvas(im.width * ratio, im.height * ratio);
    c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function decodeCanvas(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const gray = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0; i < gray.length; i++) {
    const a = data.data[i * 4 + 3] / 255;
    gray[i] =
      ((data.data[i * 4] + 2 * data.data[i * 4 + 1] + data.data[i * 4 + 2]) /
        4) *
        a +
      255 * (1 - a);
  }
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new MultiFormatReader();
  for (const invert of [false, true]) {
    try {
      const values = invert ? gray.map((v) => 255 - v) : gray;
      return reader
        .decode(
          new BinaryBitmap(
            new HybridBinarizer(
              new RGBLuminanceSource(values, c.width, c.height),
            ),
          ),
          hints,
        )
        .getText();
    } catch {
      reader.reset();
    }
  }
  throw Error("未能识别二维码，请上传更清晰的原图，或调整样式后重试");
}
export async function decodeImage(src: string) {
  const im = await loadImage(src);
  for (const max of [1600, 1000, 2400]) {
    const r = Math.min(1, max / Math.max(im.width, im.height)),
      c = makeCanvas(im.width * r, im.height * r);
    c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
    try {
      return decodeCanvas(c);
    } catch {}
  }
  throw Error("未识别到有效二维码，请使用清晰、完整的收款截图");
}
export async function cropImage(src: string, crop: Crop) {
  const im = await loadImage(src),
    c = makeCanvas(Math.min(1600, crop.size));
  c.getContext("2d")!.drawImage(
    im,
    crop.x,
    crop.y,
    crop.size,
    crop.size,
    0,
    0,
    c.width,
    c.height,
  );
  return c.toDataURL("image/png");
}
export async function suggestCrop(src: string): Promise<Crop> {
  const im = await loadImage(src);
  const r = Math.min(1, 600 / Math.max(im.width, im.height)),
    c = makeCanvas(im.width * r, im.height * r),
    ctx = c.getContext("2d")!;
  ctx.drawImage(im, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const rows = new Array(c.height).fill(0);
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (d[i] + d[i + 1] + d[i + 2] < 360) rows[y]++;
    }
  let best = { score: 0, x: 0, y: 0, size: Math.min(c.width, c.height) };
  for (
    let size = Math.round(c.width * 0.25);
    size <= Math.min(c.width, c.height) * 0.92;
    size += 10
  ) {
    for (let y = 0; y + size <= c.height; y += 8) {
      let count = 0;
      for (let yy = y; yy < y + size; yy++) count += rows[yy];
      const density = count / (size * size);
      if (density < 0.035 || density > 0.45) continue;
      let left = c.width,
        right = 0;
      for (let yy = y; yy < y + size; yy++)
        for (let x = 0; x < c.width; x++) {
          const i = (yy * c.width + x) * 4;
          if (d[i] + d[i + 1] + d[i + 2] < 360) {
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
        }
      const width = right - left;
      const score = count * (1 - Math.min(1, Math.abs(width - size) / size));
      if (score > best.score) {
        best = { score, x: Math.max(0, (left + right - size) / 2), y, size };
      }
    }
  }
  const size = Math.min(im.width, im.height, (best.size / r) * 1.08);
  return {
    x: Math.max(0, Math.min(im.width - size, best.x / r - size * 0.04)),
    y: Math.max(0, Math.min(im.height - size, best.y / r - size * 0.04)),
    size,
  };
}
