import { test } from "node:test";
import assert from "node:assert/strict";
import { nodeSchema, templateSchema } from "../src/lib/model";
import { alignLabels, labelLanguages } from "../src/lib/label-position";

function fixture() {
  const node = (id: string, role: string, x: number, y: number, width: number, height: number) =>
    nodeSchema.parse({ id, role, name: id, src: `/private-assets/layer-${id}.png`,
      x, y, width, height, visible: true, opacity: 1, colorEditable: false,
      contentEditable: false, styleEditable: false, positionEditable: false,
      sizeEditable: false, defaultText: "", maxLength: 60, fontSize: 40, color: "#aaaaaa" });
  return templateSchema.parse({ id: "test", name: "test", description: "", width: 2048, height: 2048,
    cover: "/private-assets/cover.png", font: "/private-assets/font.ttf", assets: [], verified: true, version: 1,
    nodes: [node("5-0", "image", 100, 900, 400, 400), node("5-1", "wechat", 180, 950, 250, 250),
      node("7-0", "image", 800, 900, 400, 400), node("7-1", "reward", 850, 950, 300, 300),
      node("6-0", "image", 1500, 900, 400, 400), node("6-1", "alipay", 1550, 950, 300, 300),
      node("9-0", "image", 310, 1450, 72, 38), node("9-3", "image", 1900, 1453, 122, 40),
      node("9-4", "image", 150, 1451, 108, 38), node("8-0", "image", 240, 1452, 102, 49)],
    options: [{ id: "label-language", name: "二维码下方文字", defaultId: "en", choices: [
      { id: "zh", name: "中文", nodeIds: ["8-0"] },
      { id: "en", name: "英文", nodeIds: ["9-4", "9-0", "9-3"] },
    ] }],
  });
}

test("labels align with their own fixed frames, even after crossing positions, without changing other language or codes", () => {
  const t = fixture(), before = structuredClone(t);
  const nodes = alignLabels(t, "en");
  for (const [id, center] of [["9-0", 300], ["9-3", 1000], ["9-4", 1700]] as const) {
    const n = nodes.find((n) => n.id === id)!;
    assert.equal(n.x + n.width / 2, center);
    assert.equal(n.y + n.height, 1493);
  }
  for (const n of t.nodes.filter((n) => !n.id.startsWith("9-")))
    assert.deepEqual(nodes.find((next) => next.id === n.id), n);
  assert.deepEqual(t, before);
  assert.deepEqual(alignLabels({ ...t, nodes }, "en"), nodes);
});

test("centering one label preserves its height, vertical position and every other node", () => {
  const t = fixture(), nodes = alignLabels(t, "en", "9-3");
  const n = nodes.find((n) => n.id === "9-3")!;
  assert.equal(n.x, 939);
  assert.equal(n.y, 1453);
  assert.equal(n.height, 40);
  for (const other of t.nodes.filter((n) => n.id !== "9-3"))
    assert.deepEqual(nodes.find((n) => n.id === other.id), other);
});

test("missing labels and language options are handled without moving unrelated artwork", () => {
  const t = fixture();
  t.nodes = t.nodes.filter((n) => n.id !== "9-3");
  assert.equal(labelLanguages(t).find((l) => l.id === "en")!.nodes.length, 2);
  assert.equal(alignLabels(t, "missing"), t.nodes);
  assert.equal(alignLabels(t, "en", "8-0"), t.nodes);
  t.options = [];
  assert.deepEqual(labelLanguages(t), []);
});
