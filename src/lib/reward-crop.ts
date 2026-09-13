import { Crop } from "./model";

// Join nearby dark strokes to locate the complete circular code, apart from screenshot captions.
export function detectRewardCrop(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Crop {
  const mask = new Uint8Array(width * height);
  const stride = width + 1;
  const integral = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x,
        p = i * 4;
      const alpha = data[p + 3] / 255;
      mask[i] =
        ((data[p] + data[p + 1] + data[p + 2]) / 3) * alpha +
          255 * (1 - alpha) <
        150
          ? 1
          : 0;
      row += mask[i];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
    }
  }
  const radius = Math.max(2, Math.ceil(Math.min(width, height) * 0.025));
  const joined = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - radius),
      bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius),
        right = Math.min(width, x + radius + 1);
      joined[y * width + x] =
        integral[bottom * stride + right] -
          integral[top * stride + right] -
          integral[bottom * stride + left] +
          integral[top * stride + left] >
        0
          ? 1
          : 0;
    }
  }
  const queue = new Int32Array(width * height);
  let best: { score: number; crop: Crop } | undefined;
  for (let index = 0; index < joined.length; index++) {
    if (!joined[index]) continue;
    let read = 0,
      count = 1,
      pixels = 0,
      left = width,
      right = -1,
      top = height,
      bottom = -1;
    queue[0] = index;
    joined[index] = 0;
    while (read < count) {
      const i = queue[read++],
        x = i % width,
        y = Math.floor(i / width);
      if (mask[i]) {
        pixels++;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      for (const next of [
        x > 0 ? i - 1 : -1,
        x + 1 < width ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y + 1 < height ? i + width : -1,
      ]) {
        if (next >= 0 && joined[next]) {
          joined[next] = 0;
          queue[count++] = next;
        }
      }
    }
    const w = right - left + 1,
      h = bottom - top + 1;
    const aspect = Math.min(w, h) / Math.max(w, h),
      density = pixels / (w * h);
    if (w < 40 || h < 40 || aspect < 0.75 || density < 0.025 || density > 0.65)
      continue;
    // Match the PSD code's quiet area (284 px of strokes in a 330 px image),
    // so the fixed avatar and badge covers align after screenshot extraction.
    const size = Math.min(
      width,
      height,
      Math.ceil(Math.max(w, h) * (330 / 284)),
    );
    if (size < Math.max(w, h)) continue;
    const crop = {
      x: Math.max(
        0,
        Math.min(
          width - size,
          (left + right + 1 - size) / 2 + (size * 2) / 330,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          height - size,
          (top + bottom + 1 - size) / 2 + (size * 0.5) / 331,
        ),
      ),
      size,
    };
    // Do not tighten an original, already-cropped square code a second time.
    if (
      Math.abs(width - height) <= Math.min(width, height) * 0.015 &&
      size >= Math.min(width, height) * 0.98
    ) {
      crop.size = Math.min(width, height);
      crop.x = (width - crop.size) / 2;
      crop.y = (height - crop.size) / 2;
    }
    const score = w * h * aspect;
    if (!best || score > best.score) best = { score, crop };
  }
  if (!best) throw Error("未找到完整赞赏码，请上传清晰的原码或完整截图");
  return best.crop;
}
