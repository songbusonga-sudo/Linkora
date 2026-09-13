import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backgroundRect,
  backgroundViewport,
  scaleBackgroundFromCorner,
} from "../src/lib/background-transform";
import { backgroundTransformSchema } from "../src/lib/model";

test("original artwork retains PSD geometry and can now be resized and moved", () => {
  const canvas = { width: 1000, height: 1000 };
  const node = {
    src: "/private-assets/bg.png",
    x: -100,
    y: 20,
    width: 1200,
    height: 400,
  };
  const image = { width: 2400, height: 800 };
  assert.deepEqual(backgroundRect(canvas, node, node.src, image), {
    x: -100,
    y: 20,
    width: 1200,
    height: 400,
  });
  assert.deepEqual(
    backgroundRect(canvas, node, node.src, image, {
      scale: 0.5,
      x: 0.1,
      y: -0.1,
    }),
    { x: 300, y: 20, width: 600, height: 200 },
  );
});

test("moving a background on either axis preserves its complete selection size", () => {
  const canvas = { width: 1000, height: 1000 };
  const node = { src: "/private-assets/bg.png", x: 0, y: 0, width: 1000, height: 800 };
  const image = { width: 1000, height: 800 };
  const start = backgroundRect(canvas, node, node.src, image, { scale: 1.5, x: 0, y: 0 });
  const vertical = backgroundRect(canvas, node, node.src, image, { scale: 1.5, x: 0, y: -0.3 });
  const horizontal = backgroundRect(canvas, node, node.src, image, { scale: 1.5, x: 0.25, y: 0 });
  assert.deepEqual(
    [vertical.width, vertical.height],
    [start.width, start.height],
  );
  assert.deepEqual(
    [horizontal.width, horizontal.height],
    [start.width, start.height],
  );
  assert.notEqual(vertical.y, start.y);
  assert.notEqual(horizontal.x, start.x);
});

test("replacement framing supports both axes, legacy vertical positions, and proportional exports", () => {
  const canvas = { width: 1000, height: 1000 };
  const node = { ...canvas, x: 0, y: 0, src: "/private-assets/bg.png" };
  const source = "/api/assets/new.png",
    image = { width: 1000, height: 2000 };
  assert.equal(
    backgroundRect(canvas, node, source, image, undefined, 75).y,
    -750,
  );
  const transform = { scale: 1.5, x: 0.1, y: 0.2 };
  const rect = backgroundRect(canvas, node, source, image, transform);
  assert.deepEqual(rect, { x: -150, y: -800, width: 1500, height: 3000 });
  const doubled = backgroundRect(
    { width: 2000, height: 2000 },
    node,
    source,
    image,
    transform,
  );
  assert.deepEqual(
    doubled,
    Object.fromEntries(
      Object.entries(rect).map(([key, value]) => [key, value * 2]),
    ),
  );
  assert.throws(() =>
    backgroundTransformSchema.parse({ ...transform, scale: 0 }),
  );
  assert.throws(() =>
    backgroundTransformSchema.parse({ ...transform, x: Infinity }),
  );
});

test("replacement backgrounds are constrained to the fixed area above the divider", () => {
  const canvas = { width: 1000, height: 1000 };
  const viewport = backgroundViewport(canvas, [
    { name: "分割线 1", y: 480 },
    { name: "分割线 2", y: 500 },
  ]);
  assert.deepEqual(viewport, { x: 0, y: 0, width: 1000, height: 480 });

  const node = { ...canvas, x: 0, y: 0, src: "/private-assets/bg.png" };
  const rect = backgroundRect(
    canvas,
    node,
    "/api/assets/portrait.png",
    { width: 500, height: 1000 },
    { scale: 1, x: 0, y: 0 },
    50,
    viewport,
  );
  assert.deepEqual(rect, { x: 0, y: -760, width: 1000, height: 2000 });

  const moved = backgroundRect(
    canvas,
    node,
    "/api/assets/portrait.png",
    { width: 500, height: 1000 },
    { scale: 2, x: 999, y: -999 },
    50,
    viewport,
  );
  assert.ok(moved.x <= viewport.x);
  assert.ok(moved.x + moved.width >= viewport.x + viewport.width);
  assert.ok(moved.y <= viewport.y);
  assert.ok(moved.y + moved.height >= viewport.y + viewport.height);
});

test("stored background rotation preserves old transforms and validates degrees", () => {
  const legacy = { scale: 1, x: 0, y: 0 };
  assert.deepEqual(backgroundTransformSchema.parse(legacy), legacy);
  assert.deepEqual(backgroundTransformSchema.parse({ ...legacy, rotation: -90 }), { ...legacy, rotation: -90 });
  assert.throws(() => backgroundTransformSchema.parse({ ...legacy, rotation: 181 }));
  assert.throws(() => backgroundTransformSchema.parse({ ...legacy, rotation: Infinity }));
});

test("corner resize keeps the diagonally opposite background corner fixed", () => {
  const canvas = { width: 1000, height: 1000 }, base = { width: 1000, height: 800 };
  const rightBottom = scaleBackgroundFromCorner(
    { scale: 1, x: 0, y: 0 },
    { x: 1, y: 1 },
    1.5,
    base,
    canvas,
  );
  assert.deepEqual(rightBottom, { scale: 1.5, x: 0.25, y: 0.2 });

  const rotated = scaleBackgroundFromCorner(
    { scale: 1, x: 0, y: 0, rotation: 90 },
    { x: 1, y: 1 },
    1.5,
    base,
    canvas,
  );
  assert.ok(Math.abs(rotated.x + 0.2) < 1e-10);
  assert.ok(Math.abs(rotated.y - 0.25) < 1e-10);
});
