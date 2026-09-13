import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { templateSchema, validateTemplate } from "../src/lib/model";
import { deleteLayer } from "../src/lib/layer-delete";

const fixture = () => templateSchema.parse({
  id: "delete-test", name: "Test", description: "", width: 2048, height: 2048,
  cover: "/private-assets/mock.png", font: "/private-assets/mock.ttf", assets: [],
  verified: true, version: 1, rewardLayersVersion: 1,
  nodes: ["wechat", "alipay", "reward", "avatar", "rewardAvatar", "image", "image"].map((role, i) => ({
    id: String(i), role, name: role, src: "/private-assets/mock.png", x: 100, y: 100, width: 200, height: 200,
    visible: true, opacity: 1, contentEditable: false, colorEditable: false, styleEditable: false,
    positionEditable: false, sizeEditable: false, defaultText: "", maxLength: 12, fontSize: 40, color: "#000000",
    ...(i === 5 ? { clipTo: "4" } : {}),
  })),
  options: [{ id: "avatars", name: "头像", replacementNodeId: "4", defaultId: "a",
    choices: [{ id: "a", name: "A", nodeIds: ["5"] }, { id: "b", name: "B", nodeIds: ["6"] }] }],
});

test("deleting the main avatar is valid and leaves original template and source assets intact", () => {
  const t = fixture(), result = deleteLayer(t, "3");
  validateTemplate(templateSchema.parse(result));
  assert.equal(result.nodes.some((n) => n.role === "avatar"), false);
  assert.equal(t.nodes.some((n) => n.role === "avatar"), true);
  assert.equal(result.verified, false);
  assert.equal(result.assets, t.assets);
  assert.equal(deleteLayer(t, "missing"), t);
  assert.throws(() => deleteLayer(t, "0"));
  assert.throws(() => validateTemplate({ ...t, nodes: [...t.nodes, { ...t.nodes[3], id: "duplicate" }] }));
});
test("deletion repairs default choices, removes empty groups and clears clipping/upload references", () => {
  const t = fixture();
  const one = deleteLayer(t, "5");
  assert.equal(one.options[0].defaultId, "b");
  assert.equal(one.options[0].choices.length, 1);
  const none = deleteLayer(one, "6");
  assert.equal(none.options.length, 0);
  const slot = deleteLayer(t, "4");
  assert.equal(slot.options[0].replacementNodeId, undefined);
  assert.equal(slot.nodes.find((n) => n.id === "5")!.clipTo, undefined);
  for (const template of [one, none, slot]) validateTemplate(templateSchema.parse(template));
  const grouped = fixture();
  grouped.options[0].choices = [{ id: "a", name: "Group", nodeIds: ["5", "6"] }, { id: "off", name: "无", nodeIds: [] }];
  assert.deepEqual(deleteLayer(grouped, "5").options[0].choices.map((c) => c.nodeIds), [["6"], []]);
});
test("deleted avatar stays deleted through save/publish/reload while historical version is preserved", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "linkora-delete-test-"));
  process.env.LINKORA_DATA_DIR = dir;
  const t = fixture();
  writeFileSync(path.join(dir, "seed.json"), JSON.stringify(t));
  const { db, saveDraft, publish, snapshot } = await import("../src/lib/db");
  const next = deleteLayer(t, "3");
  next.verified = true;
  saveDraft(next, 1);
  publish(t.id, 2);
  assert.equal(snapshot(t.id, 2)!.nodes.some((n) => n.role === "avatar"), false);
  assert.equal(snapshot(t.id, 1)!.nodes.some((n) => n.role === "avatar"), true);
  db.close();
});
