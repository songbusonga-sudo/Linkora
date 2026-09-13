import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultsSchema, emptyEdits, ready, Template, templateSchema } from "../src/lib/model";
import { resolveDefaultDisplay } from "../src/lib/default-display";
import { presetStyle } from "../src/lib/qr";
import { persistDefaultDisplay } from "../src/lib/save-default-display";
import { editableFooter } from "../src/lib/template-upgrades";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const fixture = () => templateSchema.parse({
  id: "defaults-test", name: "Test", description: "", width: 2048, height: 2048,
  cover: "/private-assets/mock.png", font: "/private-assets/mock.ttf", assets: [], options: [], verified: true, version: 1,
  nodes: ["wechat", "alipay", "reward", "avatar", "background", "signature"].map(role => ({
    id: role, role, name: role, src: "/private-assets/mock.png", x: 0, y: 0, width: 200, height: 200,
    visible: true, opacity: 1, contentEditable: role === "background", styleEditable: role === "wechat", colorEditable: false,
    positionEditable: false, sizeEditable: false, defaultText: "", maxLength: 12, fontSize: 40, color: "#000000",
  })),
  defaults: { edits: { ...emptyEdits(), images: { avatar: "/api/assets/avatar.png", background: "/api/assets/bg.png" }, texts: { signature: "默认署名" }, backgroundY: 75 },
    codes: { wechat: { image: "/api/assets/code.png", content: "wxp://default", confirmed: true, name: "default" } },
    styles: { wechat: presetStyle("a2"), alipay: presetStyle() } },
});
test("default display respects locked layers, user replacements and required uploads", () => {
  const t = fixture(), edits = emptyEdits();
  const styles = { wechat: presetStyle(), alipay: presetStyle() };
  edits.images.avatar = "/api/assets/disallowed.png";
  edits.images.background = "/api/assets/user-bg.png";
  edits.images["code-avatar-wechat"] = "/api/assets/user-logo.png";
  edits.backgroundY = 30;
  const user = { image: "/api/assets/user-code.png", content: "wxp://user", confirmed: true, name: "user" };
  const result = resolveDefaultDisplay(t, edits, { wechat: user }, styles);
  assert.equal(result.edits.images.avatar, "/api/assets/avatar.png");
  assert.equal(result.edits.images.background, "/api/assets/user-bg.png");
  assert.equal(result.edits.images["code-avatar-wechat"], undefined);
  assert.equal(result.edits.backgroundY, 30);
  assert.equal(result.codes.wechat?.content, "wxp://user");
  assert.equal(result.styles.wechat.series, "A1");
  const initial = resolveDefaultDisplay(t, emptyEdits(), {}, styles);
  assert.equal(initial.styles.wechat.series, "A2");
  assert.equal(initial.edits.backgroundY, 75);
  assert.equal(initial.edits.texts.signature, "默认署名");
  assert.equal(ready({}), false);
  assert.equal(t.nodes.find(n => n.role === "avatar")?.contentEditable, false);
});
test("old synthetic code avatars are removed without touching real avatar defaults or the original snapshot", () => {
  const t = fixture();
  t.defaults!.edits.images["code-avatar-wechat"] = "/api/assets/old-logo.png";
  t.defaults!.edits.images["code-avatar-alipay"] = "/api/assets/old-logo.png";
  const upgraded = editableFooter(t);
  assert.equal(upgraded.defaults!.edits.images["code-avatar-wechat"], undefined);
  assert.equal(upgraded.defaults!.edits.images["code-avatar-alipay"], undefined);
  assert.equal(upgraded.defaults!.edits.images.avatar, t.defaults!.edits.images.avatar);
  assert.equal(t.defaults!.edits.images["code-avatar-wechat"], "/api/assets/old-logo.png");
});
test("published defaults survive reload and raw image data cannot enter persisted snapshots", async () => {
  const t = fixture();
  assert.throws(() => defaultsSchema.parse({ ...t.defaults, edits: { ...t.defaults!.edits, images: { avatar: "data:image/png;base64,AAA" } } }));
  const pending = structuredClone(t);
  pending.defaults!.edits.backgroundTransforms = {
    "/api/assets/bg.png": { scale: 1.6, x: 0.1, y: -0.2 },
    "/private-assets/mock.png": { scale: 0.75, x: -0.05, y: 0.1 },
  };
  pending.defaults!.edits.images.avatar = "data:image/png;base64,AAA";
  const asset = { id: "cached.png", src: "/api/assets/cached.png", name: "cached", category: "avatar" as const, distributable: false };
  const saved = await persistDefaultDisplay(pending, new Map([["data:image/png;base64,AAA", asset]]));
  defaultsSchema.parse(saved.defaults);
  assert.equal(saved.defaults!.edits.images.avatar, asset.src);
  assert.equal(saved.assets.at(-1)?.id, asset.id);
  const dir = mkdtempSync(path.join(tmpdir(), "linkora-defaults-"));
  process.env.LINKORA_DATA_DIR = dir;
  writeFileSync(path.join(dir, "seed.json"), JSON.stringify(t));
  const { db, saveDraft, publish, snapshot } = await import("../src/lib/db");
  saveDraft(saved as Template, 1); publish(t.id, 2);
  assert.deepEqual(snapshot(t.id, 2)!.defaults, saved.defaults);
  assert.equal(snapshot(t.id, 1)!.defaults!.edits.images.avatar, "/api/assets/avatar.png");
  db.close();
});

test("background settings resolve by image and cannot be overridden on locked backgrounds", () => {
  const t = fixture(), styles = { wechat: presetStyle(), alipay: presetStyle() };
  const a = { scale: 1.5, x: 0.2, y: -0.1 }, b = { scale: 0.8, x: -0.1, y: 0.2 };
  t.defaults!.edits.backgroundTransforms = { "/api/assets/a.png": a, "/api/assets/b.png": b };
  const edits = emptyEdits();
  edits.images.background = "/api/assets/b.png";
  const resolved = resolveDefaultDisplay(t, edits, {}, styles);
  assert.deepEqual(resolved.edits.backgroundTransforms, t.defaults!.edits.backgroundTransforms);
  edits.backgroundTransforms = { "/api/assets/a.png": { ...a, scale: 2 } };
  assert.equal(resolveDefaultDisplay(t, edits, {}, styles).edits.backgroundTransforms!["/api/assets/a.png"].scale, 2);
  assert.deepEqual(t.defaults!.edits.backgroundTransforms["/api/assets/a.png"], a);
  t.nodes.find(n => n.role === "background")!.contentEditable = false;
  assert.deepEqual(resolveDefaultDisplay(t, edits, {}, styles).edits.backgroundTransforms, t.defaults!.edits.backgroundTransforms);
  assert.equal(resolveDefaultDisplay(t, edits, {}, styles).edits.backgroundY, 75);
});

test("saving uploaded backgrounds rewrites every framing key, including an unselected upload", async () => {
  const t = fixture(), a = "data:image/png;base64,AAA", b = "data:image/png;base64,BBB";
  const transform = { scale: 1.4, x: 0.1, y: -0.2 };
  t.defaults!.edits.images.background = a;
  t.defaults!.edits.backgroundTransforms = { [a]: transform, [b]: { ...transform, scale: 0.8 } };
  const assets = ["a", "b"].map(id => ({ id, src: `/api/assets/${id}.png`, name: id, category: "background" as const, distributable: false }));
  const saved = await persistDefaultDisplay(t, new Map([[a, assets[0]], [b, assets[1]]]));
  assert.equal(saved.defaults!.edits.images.background, assets[0].src);
  assert.deepEqual(saved.defaults!.edits.backgroundTransforms, { [assets[0].src]: transform, [assets[1].src]: { ...transform, scale: 0.8 } });
  assert.equal(saved.assets.length, 2);
  assert.equal(JSON.stringify(saved).includes("data:image/"), false);
  defaultsSchema.parse(saved.defaults);
  assert.throws(() => defaultsSchema.parse(t.defaults));
});

test("changing an unrelated image retains legacy background framing", () => {
  const t = fixture(), edits = emptyEdits();
  edits.images.avatar = "/api/assets/avatar-2.png";
  assert.equal(resolveDefaultDisplay(t, edits, {}, { wechat: presetStyle(), alipay: presetStyle() }).edits.backgroundY, 75);
});
