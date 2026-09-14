import { test } from "node:test";
import assert from "node:assert/strict";
import { nodeSchema, templateSchema } from "../src/lib/model";
import {
  defaultLayerColor,
  defaultLayerColors,
  editableLabelColor,
  editableRewardColor,
  editableRewardIconColor,
  tintRewardPixels,
} from "../src/lib/layer-colors";

const node = (id: string, role = "image") =>
  nodeSchema.parse({
    id,
    role,
    name: id,
    src: `/private-assets/layer-${id}.png`,
    x: 20,
    y: 30,
    width: 300,
    height: 300,
    visible: true,
    opacity: 1,
    colorEditable: false,
    contentEditable: false,
    styleEditable: false,
    positionEditable: false,
    sizeEditable: false,
    defaultText: "",
    maxLength: 60,
    fontSize: 42,
    color: "#aaaaaa",
  });

test("all PSD dividers get the requested default overlay", () => {
  for (let i = 0; i < 73; i++) {
    const colored = defaultLayerColor(node(`3-${i}`));
    assert.equal(colored.colorEditable, true);
    assert.equal(colored.color, "#a0a0a0");
  }
});
test("frame overlays affect strokes only and code images remain protected", () => {
  for (const id of ["5-0", "6-0", "7-0"]) {
    const colored = defaultLayerColor(node(id));
    assert.equal(colored.strokeOnly, true);
    assert.equal(colored.colorEditable, true);
    assert.equal(colored.color, "#bebcbc");
  }
  for (const role of ["wechat", "alipay", "reward"]) {
    const original = node("5-1", role);
    assert.equal(defaultLayerColor(original), original);
  }
  for (const text of [
    node("10-0", "signature"),
    { ...node("9-1", "text"), fixedDashes: true },
  ]) {
    assert.equal(defaultLayerColor(text).color, "#bebcbc");
    assert.equal(defaultLayerColor(text).colorEditable, true);
  }
});
test("default color upgrade preserves positions and later saved custom colors", () => {
  const template = templateSchema.parse({
    id: "test",
    name: "Test",
    description: "",
    width: 2048,
    height: 2048,
    cover: "/private-assets/mock.png",
    font: "/private-assets/mock.ttf",
    nodes: [node("3-0"), node("5-0"), node("10-0", "signature")],
    options: [],
    assets: [],
    verified: true,
    version: 1,
  });
  const upgraded = defaultLayerColors(template);
  assert.equal(upgraded.nodes[0].x, 20);
  assert.equal(upgraded.nodes[0].y, 30);
  assert.equal(template.nodes[0].colorEditable, false);
  upgraded.nodes[0].color = "#123456";
  upgraded.nodes[0].colorEditable = false;
  assert.equal(
    defaultLayerColors(templateSchema.parse(upgraded)).nodes[0].color,
    "#123456",
  );
  assert.equal(defaultLayerColors(upgraded).nodes[0].colorEditable, false);
  upgraded.nodes.push(node("7-1", "reward"));
  const rewardEnabled = editableRewardColor(upgraded);
  assert.equal(rewardEnabled.nodes.at(-1)!.colorEditable, true);
  assert.equal(rewardEnabled.nodes.at(-1)!.color, "#000000");
  assert.equal(upgraded.nodes.at(-1)!.colorEditable, false);
  rewardEnabled.nodes.at(-1)!.color = "#123456";
  rewardEnabled.nodes.at(-1)!.colorEditable = false;
  assert.deepEqual(editableRewardColor(templateSchema.parse(rewardEnabled)), rewardEnabled);
});

test("reward tint preserves white, transparency and antialiased ink", () => {
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 255, 255, 255, 255, 255,
    128, 128, 128, 255, 0, 0, 0, 0, 0, 0, 0, 128,
  ]);
  tintRewardPixels(pixels, "#204080");
  assert.deepEqual(Array.from(pixels.slice(0, 8)), [32, 64, 128, 255, 255, 255, 255, 255]);
  assert.deepEqual(Array.from(pixels.slice(8, 12)), [144, 160, 192, 255]);
  assert.equal(pixels[15], 0);
  assert.deepEqual(Array.from(pixels.slice(16)), [32, 64, 128, 128]);
});

test("gray preset artwork uses the chosen ink while preserving white and transparency", () => {
  const pixels = new Uint8ClampedArray([
    106, 106, 106, 255, 180, 180, 180, 255,
    255, 255, 255, 255, 0, 0, 0, 0,
  ]);
  tintRewardPixels(pixels, "#285ca3", true);
  assert.deepEqual([...pixels.slice(0, 4)], [40, 92, 163, 255]);
  assert.ok(pixels[4] > 40 && pixels[4] < pixels[5] && pixels[5] < pixels[6]);
  assert.deepEqual([...pixels.slice(8, 12)], [255, 255, 255, 255]);
  assert.equal(pixels[15], 0);
});

test("each selectable reward icon accepts its own colour overlay", () => {
  const template = templateSchema.parse({
    id: "icon-colors",
    name: "Icon colors",
    description: "",
    width: 2048,
    height: 2048,
    cover: "/private-assets/mock.png",
    font: "/private-assets/mock.ttf",
    nodes: [
      node("7-4-0", "rewardIcon"),
      node("7-4-1"),
      node("7-4-2"),
    ],
    options: [{
      id: "reward-icon",
      name: "图标",
      replacementNodeId: "7-4-0",
      defaultId: "one",
      choices: [
        { id: "one", name: "一", nodeIds: ["7-4-1"] },
        { id: "two", name: "二", nodeIds: ["7-4-2"] },
      ],
    }],
    assets: [],
    verified: true,
    version: 1,
  });
  const upgraded = editableRewardIconColor(template);
  for (const id of ["7-4-0", "7-4-1", "7-4-2"])
    assert.equal(upgraded.nodes.find((n) => n.id === id)?.colorEditable, true);
  upgraded.nodes[1].color = "#123456";
  assert.deepEqual(editableRewardIconColor(upgraded), upgraded);
});

test("Chinese and English code captions each accept their own colour overlay", () => {
  const template = templateSchema.parse({
    id: "label-colors", name: "Label colors", description: "", width: 2048, height: 2048,
    cover: "/private-assets/mock.png", font: "/private-assets/mock.ttf", assets: [], verified: true, version: 1,
    nodes: [node("5-1", "wechat"), node("6-1", "alipay"), node("7-1", "reward"), node("8-0"), node("9-0"), node("9-3"), node("9-4")],
    options: [{ id: "label-language", name: "二维码下方文字", defaultId: "zh", choices: [
      { id: "zh", name: "中文", nodeIds: ["8-0"] },
      { id: "en", name: "英文", nodeIds: ["9-0", "9-3", "9-4"] },
    ] }],
  });
  const upgraded = editableLabelColor(template);
  for (const id of ["8-0", "9-0", "9-3", "9-4"])
    assert.equal(upgraded.nodes.find((n) => n.id === id)?.colorEditable, true);
  assert.equal(upgraded.nodes.find((n) => n.id === "8-0")?.color, "#a0a0a0");
  assert.deepEqual(editableLabelColor(upgraded), upgraded);
});
