import { test } from "node:test";
import assert from "node:assert/strict";
import { nodeSchema, templateSchema, validateTemplate } from "../src/lib/model";
import {
  assertFixedFrames,
  qrModules,
  quietBox,
  upgradeCodePlacement,
} from "../src/lib/code-placement";
import { moveLayer, resizeCode } from "../src/lib/layer-position";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const node = (
  id: string,
  role: string,
  x: number,
  y: number,
  width: number,
  height = width,
) =>
  nodeSchema.parse({
    id,
    role,
    x,
    y,
    width,
    height,
    name: id,
    src: `/private-assets/layer-${id}.png`,
    visible: true,
    opacity: 1,
    colorEditable: false,
    contentEditable: false,
    styleEditable: false,
    positionEditable: false,
    sizeEditable: false,
    defaultText: "",
    maxLength: 12,
    fontSize: 40,
    color: "#000000",
  });
function fixture() {
  return templateSchema.parse({
    id: "fixture",
    name: "Fixture",
    description: "",
    width: 2048,
    height: 2048,
    cover: "/private-assets/cover.png",
    font: "/private-assets/font.ttf",
    options: [],
    assets: [],
    verified: true,
    version: 1,
    nodes: [
      node("5-0", "image", 100, 500, 371, 372),
      node("5-1", "wechat", 120, 521, 330),
      node("6-0", "image", 600, 500, 371, 372),
      node("6-1", "alipay", 620, 521, 330),
      node("7-0", "image", 1100, 500, 371),
      node("7-1", "reward", 1120.5, 520.5, 330),
      node("7-2", "rewardAvatar", 1230, 630, 100),
      node("7-4", "rewardIcon", 1340, 740, 40),
      node("avatar", "avatar", 100, 100, 100),
      node("background", "background", 0, 0, 2048),
      node("signature", "signature", 500, 300, 200),
    ],
  });
}
test("draft upgrade separates QR body dimensions without changing source snapshots or frames", () => {
  const t = fixture(),
    before = structuredClone(t),
    u = upgradeCodePlacement(t);
  assert.deepEqual(t, before);
  assert.equal(u.codePlacementVersion, 1);
  assert.equal(u.verified, false);
  assert.equal(upgradeCodePlacement(u), u);
  assertFixedFrames(t, u);
  assert.equal(u.nodes[1].width, (t.nodes[1].width * 5) / 7);
  assert.equal(
    u.nodes[1].x + u.nodes[1].width / 2,
    t.nodes[1].x + t.nodes[1].width / 2,
  );
  validateTemplate(u);
});
test("quiet zone follows the matrix count while body size stays identical for short and long contents", () => {
  const t = upgradeCodePlacement(fixture()),
    n = t.nodes[1];
  for (const correct_level of ["low", "medium", "quartile", "high"] as const) {
    const style = { correct_level } as Parameters<typeof qrModules>[1];
    const counts = [
      qrModules("wxp://test", style),
      qrModules("https://qr.alipay.com/" + "a".repeat(250), style),
    ];
    assert.ok(counts[1] > counts[0]);
    for (const count of counts) {
      const b = quietBox(n, count),
        pad = (n.width * 4) / count;
      assert.ok(Math.abs(b.width - 2 * pad - n.width) < 1e-9);
      assert.ok(Math.abs(b.x + pad - n.x) < 1e-9);
    }
  }
});
test("fixed frames reject forged changes while masked code layers allow overflow", () => {
  const t = upgradeCodePlacement(fixture());
  for (const key of ["x", "y", "width", "height"] as const) {
    const bad = structuredClone(t);
    bad.nodes[0][key] += 10;
    assert.throws(() => assertFixedFrames(t, bad), /外框固定/);
  }
  const bad = structuredClone(t);
  bad.nodes[1].width = bad.nodes[1].height = 370;
  bad.nodes[1].x = -150;
  bad.nodes[1].y = 100;
  bad.nodes[5].width = bad.nodes[5].height = 750;
  assert.doesNotThrow(() => validateTemplate(bad));
  assertFixedFrames(t, bad);
  bad.nodes = t.nodes.map((n) => ({ ...n, sizeEditable: n.role === "wechat" }));
  assert.throws(() => validateTemplate(bad), /固定位置及尺寸/);
  const removed = structuredClone(t);
  removed.nodes = removed.nodes.filter((n) => n.id !== "5-0");
  assert.throws(() => assertFixedFrames(t, removed), /外框固定/);
  assert.throws(() => validateTemplate(removed), /缺少固定码框/);
});
test("reward move and scale keep overlays aligned even without the old linked option, frame never moves", () => {
  const t = upgradeCodePlacement(fixture()),
    reward = t.nodes.find((n) => n.role === "reward")!;
  const moved = moveLayer(t, reward, reward.x + 2, reward.y + 3);
  for (const id of ["7-1", "7-2", "7-4"]) {
    assert.equal(
      moved.find((n) => n.id === id)!.x,
      t.nodes.find((n) => n.id === id)!.x + 2,
    );
  }
  assertFixedFrames(t, { ...t, nodes: moved });
  const resized = resizeCode(t, reward, 300, true);
  assertFixedFrames(t, { ...t, nodes: resized });
  assert.equal(resized.find((n) => n.id === "7-2")!.width, (100 * 300) / 330);
  assert.equal(moveLayer(t, t.nodes[0], 0, 0), t.nodes);
});

test("oversized and offset masked layers save and publish without changing their geometry", async () => {
  const t = upgradeCodePlacement(fixture());
  t.verified = true;
  const dir = mkdtempSync(path.join(tmpdir(), "linkora-clipping-"));
  process.env.LINKORA_DATA_DIR = dir;
  writeFileSync(path.join(dir, "seed.json"), JSON.stringify(t));
  const { db, saveDraft, publish } = await import("../src/lib/db");
  try {
    const next = structuredClone(t);
    for (const role of ["wechat", "alipay", "reward"]) {
      const n = next.nodes.find((n) => n.role === role)!;
      next.nodes = resizeCode(next, n, 800);
      const resized = next.nodes.find((item) => item.id === n.id)!;
      next.nodes = moveLayer(next, resized, resized.x - 90, resized.y + 80);
    }
    assertFixedFrames(t, next);
    saveDraft(next, 1);
    const published = publish(t.id, 2);
    assert.deepEqual(published.nodes, next.nodes);
  } finally {
    db.close();
  }
});
