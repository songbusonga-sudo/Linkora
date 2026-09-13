import { test } from "node:test";
import assert from "node:assert/strict";
import { codeColors, rewardArtworkIds, unifiedQRColor } from "../src/lib/code-appearance";
import { defaultsSchema, emptyEdits, Template } from "../src/lib/model";
import { presetStyle, restyleQR } from "../src/lib/qr";
import { normalizeRecentColors } from "../src/lib/recent-colors";
import { resolveDefaultDisplay } from "../src/lib/default-display";

test("all style presets and style reset retain the chosen unified ink", () => {
  const initial = unifiedQRColor(presetStyle(), "#285ca3");
  for (const preset of ["a1", "a1c", "a1p", "a2", undefined]) {
    const next = restyleQR(initial, preset);
    assert.equal(next.content_point_color, "#285ca3");
    assert.equal(next.positioning_point_color, "#285ca3");
  }
  const legacy = restyleQR(initial, "a2c");
  assert.equal(legacy.preset, "a2");
});

test("shared appearance survives saved defaults and user overrides", () => {
  const defaults = defaultsSchema.parse({
    edits: { ...emptyEdits(), codeColors: { frame: "#123456", ink: "#285ca3" }, rewardAvatarOpacity: 0.3 },
    codes: {}, styles: { wechat: presetStyle(), alipay: presetStyle() },
  });
  const t = { nodes: [], defaults } as unknown as Template;
  const initial = resolveDefaultDisplay(t, emptyEdits(), {}, defaults.styles);
  assert.deepEqual(codeColors(t, initial.edits, initial.styles.wechat), defaults.edits.codeColors);
  assert.equal(initial.edits.rewardAvatarOpacity, 0.3);
  const user = resolveDefaultDisplay(t, { ...emptyEdits(), codeColors: { ink: "#654321" }, rewardAvatarOpacity: 0 }, {}, defaults.styles);
  assert.deepEqual(user.edits.codeColors, { frame: "#123456", ink: "#654321" });
  assert.equal(user.edits.rewardAvatarOpacity, 0);
  assert.throws(() => defaultsSchema.parse({ ...defaults, edits: { ...defaults.edits, rewardAvatarOpacity: 1.1 } }));
});

test("reward appearance follows uploaded targets and every preset without fading the white backing", () => {
  const t = { nodes: [
    { id: "cover", role: "image" }, { id: "avatar", role: "rewardAvatar" },
    { id: "avatar1", role: "image", clipTo: "avatar" }, { id: "icon", role: "rewardIcon" },
  ], options: [
    { replacementNodeId: "avatar", choices: [{ nodeIds: ["avatar1"] }, { nodeIds: ["avatar2"] }] },
    { replacementNodeId: "icon", choices: [{ nodeIds: ["icon1"] }, { nodeIds: ["icon2"] }] },
  ] } as unknown as Template;
  assert.deepEqual([...rewardArtworkIds(t, "rewardAvatar")], ["avatar", "avatar1", "avatar2"]);
  assert.deepEqual([...rewardArtworkIds(t, "rewardIcon")], ["icon", "icon1", "icon2"]);
});

test("recent colors reject invalid storage, normalize, deduplicate and keep the newest eight", () => {
  assert.deepEqual(normalizeRecentColors(null), []);
  assert.deepEqual(normalizeRecentColors(["#ABCDEF", "invalid", null, "#abcdef", "#123456"]), ["#abcdef", "#123456"]);
  assert.equal(normalizeRecentColors(Array.from({ length: 12 }, (_, i) => `#0000${i.toString(16).padStart(2, "0")}`)).length, 8);
});
