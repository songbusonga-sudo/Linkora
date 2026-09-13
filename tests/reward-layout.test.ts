import { test } from "node:test";
import assert from "node:assert/strict";
import { nodeSchema, templateSchema, validateTemplate } from "../src/lib/model";
import { editableRewardLayers } from "../src/lib/reward-layers";
import { resizeCode } from "../src/lib/layer-position";
import { detectRewardCrop } from "../src/lib/reward-crop";

const n = (
  id: string,
  role = "image",
  x = 0,
  y = 0,
  width = 100,
  height = width,
) =>
  nodeSchema.parse({
    id,
    role,
    name: id,
    src: `/private-assets/layer-${id}.png`,
    x,
    y,
    width,
    height,
    visible: true,
    opacity: 1,
    colorEditable: false,
    contentEditable: false,
    styleEditable: false,
    positionEditable: false,
    sizeEditable: false,
    defaultText: "",
    maxLength: 12,
    fontSize: 42,
    color: "#000000",
  });
const fixture = () =>
  templateSchema.parse({
    id: "test",
    name: "Test",
    description: "",
    width: 2048,
    height: 2048,
    cover: "/private-assets/mock.png",
    font: "/private-assets/mock.ttf",
    options: [],
    assets: [],
    verified: true,
    version: 1,
    nodes: [
      n("0", "background"),
      n("2", "avatar"),
      n("10-0", "signature"),
      n("5-0"),
      n("5-1", "wechat"),
      n("6-0"),
      n("6-1", "alipay"),
      n("7-0", "image", 839, 1195, 371),
      n("7-1", "reward", 860, 1215, 330, 331),
      n("7-2", "rewardAvatar", 965, 1322, 118),
      n("7-3", "image", 1082, 1439, 59),
      n("7-4", "rewardIcon", 1080, 1445, 66, 59),
    ],
  });

test("reward PSD restores all presets and fixed covers, with a unique upload slot", () => {
  const original = fixture();
  const t = editableRewardLayers(original);
  validateTemplate(templateSchema.parse(t));
  assert.equal(
    t.nodes.some((n) => n.id === "7-2" || n.id === "7-4"),
    false,
  );
  assert.equal(t.nodes.filter((n) => n.id.startsWith("7-2-")).length, 7);
  assert.equal(t.nodes.filter((n) => n.id.startsWith("7-4-")).length, 4);
  assert.equal(
    t.options.find((o) => o.id === "reward-avatar")!.choices.length,
    5,
  );
  assert.equal(
    t.options.find((o) => o.id === "reward-icon")!.choices.length,
    3,
  );
  assert.equal(
    t.nodes.find((n) => n.role === "rewardAvatar")!.contentEditable,
    true,
  );
  assert.equal(
    t.nodes.find((n) => n.role === "rewardIcon")!.contentEditable,
    false,
  );
  assert.equal(editableRewardLayers(t), t);
  assert.equal(original.nodes.length, 12);
});
test("admin code resizing preserves center, aspect ratio, overlay offsets and user locks", () => {
  const t = editableRewardLayers(fixture());
  const code = t.nodes.find((n) => n.role === "reward")!;
  const result = resizeCode(t, code, code.width * 1.5);
  const resized = result.find((n) => n.id === code.id)!;
  assert.equal(resized.width / resized.height, code.width / code.height);
  assert.equal(resized.x + resized.width / 2, code.x + code.width / 2);
  assert.equal(resized.y + resized.height / 2, code.y + code.height / 2);
  assert.deepEqual(
    result.find((n) => n.id === "7-0"),
    t.nodes.find((n) => n.id === "7-0"),
  );
  for (const child of t.nodes.filter(
    (n) => n.id.startsWith("7-2-") || n.id.startsWith("7-4-"),
  )) {
    const moved = result.find((n) => n.id === child.id)!;
    assert.equal(moved.width, child.width * 1.5);
    assert.equal(
      moved.x - (code.x + code.width / 2),
      (child.x - (code.x + code.width / 2)) * 1.5,
    );
    assert.equal(moved.sizeEditable, false);
  }
  const together = resizeCode(t, code, code.width * 2, true);
  assert.equal(together.find((n) => n.id === "7-0")!.width, 371);
  validateTemplate(templateSchema.parse({ ...t, nodes: together }));
  assert.equal(resizeCode(t, code, NaN), t.nodes);
});
test("automatic reward cropping locates a code separately from screenshot captions", () => {
  const width = 300,
    height = 500,
    data = new Uint8ClampedArray(width * height * 4).fill(255);
  const dark = (x: number, y: number) => {
    const i = (Math.round(y) * width + Math.round(x)) * 4;
    data[i] = data[i + 1] = data[i + 2] = 0;
  };
  for (let x = 35; x < 265; x++) for (let y = 20; y < 25; y++) dark(x, y);
  for (let a = 0; a < 360; a += 10)
    for (let r = 35; r <= 90; r++) {
      const x = 150 + Math.cos((a * Math.PI) / 180) * r,
        y = 260 + Math.sin((a * Math.PI) / 180) * r;
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) dark(x + dx, y + dy);
    }
  const crop = detectRewardCrop(data, width, height);
  assert.ok(Math.abs(crop.x + crop.size / 2 - 150) < 2);
  assert.ok(Math.abs(crop.y + crop.size / 2 - 260) < 2);
  assert.ok(crop.size > 180 && crop.size < 220);
  assert.throws(() =>
    detectRewardCrop(
      new Uint8ClampedArray(width * height * 4).fill(255),
      width,
      height,
    ),
  );
});
