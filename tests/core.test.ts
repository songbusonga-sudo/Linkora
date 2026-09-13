import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ready, templateSchema, validateTemplate } from "../src/lib/model";
import { seededRandom } from "../src/lib/qrbtf_lib/qrcodes/random";
import { moveLayer, resizeCode } from "../src/lib/layer-position";
const t = templateSchema.parse({
  id: "test-template",
  name: "Test",
  description: "",
  width: 2048,
  height: 2048,
  cover: "/private-assets/mock.png",
  font: "/private-assets/mock.ttf",
  options: [],
  assets: [],
  verified: false,
  version: 1,
  nodes: [
    "wechat",
    "alipay",
    "reward",
    "avatar",
    "background",
    "signature",
    "rewardAvatar",
    "rewardIcon",
  ].map((role, i) => ({
    id: String(i),
    name: role,
    src: "/private-assets/mock.png",
    x: 0,
    y: 0,
    width: 300,
    height: 300,
    role,
    visible: true,
    opacity: 1,
    colorEditable: false,
    contentEditable: false,
    styleEditable: false,
    positionEditable: false,
    sizeEditable: false,
    defaultText: "",
    originalText: "",
    maxLength: 12,
    fontSize: 40,
    color: "#000000",
  })),
});
test("all three codes are required, reward crop must be confirmed", () => {
  const regular = {
    image: "test",
    content: "payload",
    confirmed: true,
    name: "test",
  };
  assert.equal(ready({ wechat: regular, alipay: regular }), false);
  assert.equal(
    ready({
      wechat: regular,
      alipay: regular,
      reward: {
        image: "test",
        crop: { x: 0, y: 0, size: 100 },
        confirmed: false,
        name: "test",
      },
    }),
    false,
  );
  assert.equal(
    ready({
      wechat: regular,
      alipay: regular,
      reward: {
        image: "test",
        crop: { x: 0, y: 0, size: 100 },
        confirmed: true,
        name: "test",
      },
    }),
    true,
  );
});
test("server rejects movable codes, reward beautification and icon upload", () => {
  for (const field of [
    "positionEditable",
    "sizeEditable",
    "styleEditable",
  ] as const) {
    const bad = structuredClone(t);
    bad.nodes.find((n) => n.role === "reward")![field] = true;
    assert.throws(() => validateTemplate(bad));
  }
  const bad = structuredClone(t);
  bad.nodes.find((n) => n.role === "rewardIcon")!.contentEditable = true;
  assert.throws(() => validateTemplate(bad));
});
test("reward ink coloring is permitted while normal QR colors use their style controls", () => {
  const colored = structuredClone(t);
  colored.nodes.find((n) => n.role === "reward")!.colorEditable = true;
  assert.doesNotThrow(() => validateTemplate(colored));
  for (const role of ["wechat", "alipay"]) {
    const bad = structuredClone(t);
    bad.nodes.find((n) => n.role === role)!.colorEditable = true;
    assert.throws(() => validateTemplate(bad), /不允许整体颜色覆盖/);
  }
});
test("server rejects missing or duplicate required roles and invalid choices", () => {
  const bad = structuredClone(t);
  bad.nodes = bad.nodes.filter((n) => n.role !== "alipay");
  assert.throws(() => validateTemplate(bad));
  const other = structuredClone(t);
  other.options = [
    {
      id: "x",
      name: "x",
      defaultId: "1",
      choices: [{ id: "1", name: "x", nodeIds: ["invalid"] }],
    },
  ];
  assert.throws(() => validateTemplate(other));
});
test("random QR presets render deterministically", () => {
  const a = seededRandom("same-content"),
    b = seededRandom("same-content");
  assert.deepEqual(
    Array.from({ length: 50 }, () => a(0, 1)),
    Array.from({ length: 50 }, () => b(0, 1)),
  );
});
test("admin moves code bodies while frames and frontend permissions stay fixed", () => {
  const template = structuredClone(t);
  template.nodes = [
    { ...t.nodes[0], id: "5-0", role: "image", x: 10, y: 20 },
    { ...t.nodes[0], id: "5-1", x: 30, y: 40 },
    { ...t.nodes[1], id: "6-1", x: 300, y: 400 },
  ];
  const moved = moveLayer(template, template.nodes[1], 50, 70, true);
  assert.deepEqual(moved.map(({ x, y }) => [x, y]), [[10, 20], [50, 70], [300, 400]]);
  assert.ok(moved.every((n) => !n.positionEditable && !n.sizeEditable));
  assert.equal(template.nodes[1].x, 30);
  const bounded = moveLayer(template, template.nodes[1], -20000, 20000, true);
  assert.ok(bounded.every((n) => n.x >= -10000 && n.y <= 10000));
  assert.deepEqual(bounded[0], template.nodes[0]);
  assert.equal(bounded[1].x, -10000);
  assert.equal(bounded[1].y, 10000);
});
test("fixed-dash notes stay centered while their vertical position can change", () => {
  const template = structuredClone(t);
  const note = { ...t.nodes[0], id: "note", role: "text" as const,
    fixedDashes: true, x: 874, y: 1800 };
  template.nodes.push(note);
  const moved = moveLayer(template, note, 100, 1775).at(-1)!;
  assert.equal(moved.x, 874);
  assert.equal(moved.y, 1775);
  assert.equal(moveLayer(template, note, NaN, 0), template.nodes);
});
test("draft edits and restoration cannot mutate published snapshots; stale writes rejected", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "linkora-test-"));
  process.env.LINKORA_DATA_DIR = dir;
  writeFileSync(path.join(dir, "seed.json"), JSON.stringify(t));
  const { db, publish, published, saveDraft, snapshot } = await import("../src/lib/db");
  const initial = snapshot(t.id, 1)!;
  const edited = structuredClone(initial);
  edited.name = "Changed";
  edited.cover = "/api/assets/current-cover.png";
  edited.verified = true;
  edited.nodes.find((n) => n.role === "avatar")!.x = 123.5;
  const reward = edited.nodes.find((n) => n.role === "reward")!;
  edited.nodes = resizeCode(edited, reward, reward.width * 1.4);
  saveDraft(edited, 1);
  assert.equal(snapshot(t.id, 1)!.name, initial.name);
  assert.throws(() => saveDraft(edited, 1));
  const v2 = publish(t.id, 2);
  assert.equal(v2.version, 2);
  assert.equal(snapshot(t.id, 2)!.cover, "/api/assets/current-cover.png");
  assert.equal(published().find((template) => template.id === t.id)?.cover, "/api/assets/current-cover.png");
  assert.equal(snapshot(t.id, 2)!.nodes.find((n) => n.role === "avatar")!.x, 123.5);
  const publishedCode = snapshot(t.id, 2)!.nodes.find((n) => n.role === "reward")!;
  assert.equal(publishedCode.width, reward.width * 1.4);
  assert.equal(publishedCode.height, reward.height * 1.4);
  assert.equal(publishedCode.sizeEditable, false);
  assert.equal(snapshot(t.id, 1)!.nodes.find((n) => n.role === "reward")!.width, reward.width);
  assert.equal(snapshot(t.id, 1)!.nodes.find((n) => n.role === "avatar")!.x, 0);
  assert.equal(snapshot(t.id, 1)!.name, initial.name);
  assert.equal(snapshot(t.id, 1)!.cover, "/private-assets/mock.png");
  saveDraft(initial, 3);
  assert.equal(snapshot(t.id, 2)!.name, "Changed");
  assert.equal(snapshot(t.id, 1)!.name, initial.name);
  db.close();
});
