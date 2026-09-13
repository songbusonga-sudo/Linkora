import { chromium, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";

mkdirSync(".local/qa", { recursive: true });
const db = new DatabaseSync("data/linkora.sqlite", { readOnly: true });
const templates = db.prepare("SELECT * FROM templates").all().map((row) => ({ ...row, draft: JSON.parse(row.draft) }));
db.close();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/auth", (route) => route.fulfill({ json: { authenticated: true, configured: true } }));
  await page.route("**/api/assets", (route) => route.fulfill({ json: { id: "qa-cover.png" } }));
  await page.route("**/api/assets/qa-cover.png", async (route) => {
    const response = await page.request.get(`http://localhost:8982${templates[0].draft.nodes[0].src}`);
    return route.fulfill({ response });
  });
  await page.route("**/api/admin", (route) => {
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON();
      assert.equal(payload.action, "save");
      templates[0].draft = payload.template;
      templates[0].revision++;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { templates, assets: [], versions: [], layers: [] } });
  });
  await page.goto("http://localhost:8982/admin");
  await page.getByRole("button", { name: "更改默认展示", exact: true }).click();
  const region = page.getByRole("region", { name: "收款码上传与颜色", exact: true });
  await expect(region.locator(".color-field")).toHaveCount(2);
  const shared = region.getByRole("region", { name: "三码统一颜色" });
  await shared.locator("summary").click();
  async function choose(label, color) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("textbox", { name: `${label} HEX`, exact: true }).fill(color);
    await page.getByRole("button", { name: "关闭选色面板", exact: true }).click();
  }
  await choose("框颜色", "#854591");
  await choose("内部码颜色", "#285ca3");
  await expect(shared.getByRole("button", { name: "使用最近颜色 #854591" }).first()).toBeVisible();
  const wechat = region.getByRole("region", { name: "微信收款码设置", exact: true });
  await wechat.locator(".code-style-options summary").click();
  await expect(shared.locator("details")).not.toHaveAttribute("open", "");
  await wechat.getByRole("button", { name: "A2 线条" }).click();
  await wechat.locator(".qr-controls select").first().selectOption("a2");
  await wechat.locator(".qr-controls .field-heading").getByRole("button").click();
  await shared.locator("summary").click();
  await expect(wechat.locator("details")).not.toHaveAttribute("open", "");
  await expect(shared.locator(".hex-value").last()).toHaveText("#285CA3");
  await region.locator('[aria-label="赞赏码头像与图标"] summary').click();
  await page.getByRole("slider", { name: "中心头像透明度", exact: true }).fill("65");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText("草稿已保存", { exact: true })).toBeVisible();
  assert.deepEqual(templates[0].draft.defaults.edits.codeColors, { frame: "#854591", ink: "#285ca3" });
  assert.equal(templates[0].draft.defaults.edits.rewardAvatarOpacity, 0.35);
  await page.reload();
  await page.getByRole("button", { name: "更改默认展示", exact: true }).click();
  await page.locator('[aria-label="赞赏码头像与图标"] summary').click();
  await expect(page.getByRole("slider", { name: "中心头像透明度", exact: true })).toHaveValue("65");
  await page.getByRole("region", { name: "三码统一颜色", exact: true }).locator("summary").click();
  await page.getByRole("button", { name: "框颜色", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "框颜色选色面板", exact: true });
  await picker.getByRole("button", { name: "使用最近颜色 #285CA3", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "框颜色 HEX", exact: true })).toHaveValue("#285CA3");
  await expect(page.locator(".preview-placeholder")).toHaveCount(0, { timeout: 30000 });
  await expect(page.locator(".render-indicator")).toHaveCount(0, { timeout: 30000 });
  await page.screenshot({ path: ".local/qa/unified-colors-desktop.png" });
  await page.getByRole("button", { name: "关闭选色面板", exact: true }).click();

  await page.route("**/api/templates", (route) => route.fulfill({ json: [templates[0].draft] }));
  await page.goto("http://localhost:8982");
  await expect(page.locator(".preview-placeholder")).toHaveCount(0, { timeout: 30000 });
  await page.locator('[aria-label="赞赏码头像与图标"] summary').click();
  await expect(page.getByRole("slider", { name: "中心头像透明度", exact: true })).toHaveValue("65");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("region", { name: "三码统一颜色", exact: true }).locator("summary").click();
  await page.getByRole("button", { name: "内部码颜色", exact: true }).click();
  const mobilePicker = page.getByRole("dialog", { name: "内部码颜色选色面板", exact: true });
  await expect(mobilePicker).toBeVisible();
  const bounds = await mobilePicker.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 844);
  await page.screenshot({ path: ".local/qa/unified-colors-mobile.png" });

  const bundle = await build({ stdin: { contents: 'export { drawTemplate } from "./src/lib/render"; export { emptyEdits } from "./src/lib/model"; export { presetStyle, qrSource } from "./src/lib/qr";', resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", globalName: "appearanceQA", platform: "browser" });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const samples = await page.evaluate(async (source) => {
    const { drawTemplate, emptyEdits, presetStyle } = appearanceQA;
    const t = structuredClone(source);
    delete t.defaults;
    t.options = [];
    const raster = document.createElement("canvas"); raster.width = raster.height = 100;
    const ctx = raster.getContext("2d");
    const solid = (color) => { ctx.fillStyle = color; ctx.fillRect(0, 0, 100, 100); return raster.toDataURL(); };
    solid("#fff"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 50, 100);
    const inkSource = raster.toDataURL();
    const bodies = t.nodes.filter((n) => ["wechat", "alipay", "reward"].includes(n.role)).map((n) => ({ ...n, src: inkSource }));
    const reward = bodies.find((n) => n.role === "reward");
    const frames = t.nodes.filter((n) => ["5-0", "6-0", "7-0"].includes(n.id));
    const avatar = { ...reward, id: "avatar-test", role: "rewardAvatar", colorEditable: false, contentEditable: true, src: solid("#ff0000"), x: reward.x + reward.width * 0.6, y: reward.y + reward.height * 0.3, width: 20, height: 20 };
    const icon = { ...avatar, id: "icon-test", role: "rewardIcon", src: solid("#000000"), y: avatar.y + 35 };
    const iconPreset = { ...icon, id: "icon-preset", role: "image" };
    t.options = [{ id: "icons", replacementNodeId: icon.id, defaultId: "one", choices: [{ id: "one", nodeIds: [iconPreset.id] }] }];
    t.nodes = [...frames, ...bodies, avatar, icon, iconPreset];
    const edits = { ...emptyEdits(), codeColors: { ink: "#285ca3", frame: "#854591" } };
    const result = [];
    for (const scale of [0.5, 2]) for (const opacity of [1, 0.5, 0]) {
      edits.rewardAvatarOpacity = opacity;
      const c = await drawTemplate(t, edits, {}, { wechat: presetStyle(), alipay: presetStyle("a2") }, scale);
      const pixel = (x, y) => Array.from(c.getContext("2d").getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data);
      result.push({ scale, opacity,
        ink: bodies.map((n) => pixel(n.x + n.width * 0.3, n.y + n.height * 0.3)),
        frame: frames.map((n) => pixel(n.x + 8, n.y + n.height / 2)),
        white: bodies.map((n) => pixel(n.x + n.width * 0.7, n.y + n.height * 0.55)),
        avatar: pixel(avatar.x + 10, avatar.y + 10), icon: pixel(icon.x + 10, icon.y + 10),
      });
    }
    return result;
  }, templates[0].draft);
  for (const sample of samples) {
    for (const ink of sample.ink) assert.deepEqual(ink, [40, 92, 163, 255]);
    for (const frame of sample.frame) assert.deepEqual(frame, [133, 69, 145, 255]);
    for (const white of sample.white) assert.deepEqual(white, [255, 255, 255, 255]);
    assert.deepEqual(sample.icon, [40, 92, 163, 255]);
    const gray = Math.round(255 * (1 - sample.opacity));
    assert.equal(sample.avatar[0], 255);
    assert.ok(Math.abs(sample.avatar[1] - gray) <= 1 && Math.abs(sample.avatar[2] - gray) <= 1);
  }
  assert.deepEqual(errors, []);
  console.log("Passed: two shared controls, presets/reset preserve colors, saved appearance reloads, recent colors persist/reuse, mobile layout, three frames/inks/icon and avatar opacity at preview/export scales. Template saves were mocked.");
} finally { await browser.close(); }
