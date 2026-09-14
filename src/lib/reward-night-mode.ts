// Night-mode reward-code screenshots use a solid dark page behind the white
// code card. That backdrop is connected to the crop edge, unlike the code's
// dark modules, which are separated by their quiet white area.
export function nightRewardBackdropMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const isDark = (index: number) => {
    const offset = index * 4;
    return (
      data[offset + 3] > 0 &&
      (data[offset] + data[offset + 1] + data[offset + 2]) / 3 < 180
    );
  };
  const edge: number[] = [];
  for (let x = 0; x < width; x++) {
    edge.push(x, (height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    edge.push(y * width, y * width + width - 1);
  }
  const darkEdges = edge.filter(isDark);
  const removed = new Uint8Array(width * height);
  // Standard source codes have a quiet white border. Do nothing unless the
  // crop clearly starts in a night-mode dark page.
  if (!edge.length || darkEdges.length / edge.length < 0.6) return removed;

  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const index of darkEdges) {
    if (removed[index]) continue;
    removed[index] = 1;
    queue[tail++] = index;
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y + 1 < height ? index + width : -1,
    ];
    for (const next of neighbours) {
      if (next < 0 || removed[next] || !isDark(next)) continue;
      removed[next] = 1;
      queue[tail++] = next;
    }
  }
  return removed;
}
