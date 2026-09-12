import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ready, templateSchema, validateTemplate } from "../src/lib/model";
import { seededRandom } from "../src/lib/qrbtf_lib/qrcodes/random";
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
test("draft edits and restoration cannot mutate published snapshots; stale writes rejected", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "linkora-test-"));
  process.env.LINKORA_DATA_DIR = dir;
  writeFileSync(path.join(dir, "seed.json"), JSON.stringify(t));
  const { db, publish, saveDraft, snapshot } = await import("../src/lib/db");
  const initial = snapshot(t.id, 1)!;
  const edited = structuredClone(initial);
  edited.name = "Changed";
  edited.verified = true;
  saveDraft(edited, 1);
  assert.equal(snapshot(t.id, 1)!.name, initial.name);
  assert.throws(() => saveDraft(edited, 1));
  const v2 = publish(t.id, 2);
  assert.equal(v2.version, 2);
  assert.equal(snapshot(t.id, 1)!.name, initial.name);
  saveDraft(initial, 3);
  assert.equal(snapshot(t.id, 2)!.name, "Changed");
  assert.equal(snapshot(t.id, 1)!.name, initial.name);
  db.close();
});
