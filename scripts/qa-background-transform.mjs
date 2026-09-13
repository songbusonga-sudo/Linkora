import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { templateSchema } from "../src/lib/model.ts";

mkdirSync(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    acceptDownloads: true,
    hasTouch: true,
  });
  const [original] = await context.request
    .get("http://localhost:8982/api/templates")
    .then((r) => r.json());
  const template = structuredClone(original),
    background = template.nodes.find((n) => n.role === "background");
  background.contentEditable = true;
  const assets = ["A", "B"].map((id) => ({
    id: `qa-bg-${id}`,
    src: `/api/assets/qa-bg-${id}`,
    name: `测试背景${id}`,
    category: "background",
    distributable: false,
  }));
  template.assets = [...template.assets, ...assets];
  if (template.defaults) {
    delete template.defaults.edits.images[background.id];
    delete template.defaults.edits.backgroundTransforms;
    template.defaults.edits.backgroundY = 50;
    template.defaults.codes = {};
  }
  const row = {
    id: template.id,
    draft: template,
    revision: 1,
    published: template.version,
  };
  const state = { templates: [row], assets: [], layers: [], versions: [] };
  let published = structuredClone(template),
    failSave = false;
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const png = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 800;
      c.height = 1200;
      const ctx = c.getContext("2d");
      for (let y = 0; y < 1200; y += 100)
        for (let x = 0; x < 800; x += 100) {
          ctx.fillStyle = `hsl(${x / 8 + y / 5}, 65%, ${30 + x / 20}%)`;
          ctx.fillRect(x, y, 100, 100);
        }
      return c.toDataURL().split(",")[1];
    }),
    "base64",
  );
  await context.route("**/api/assets/qa-bg-*", (route) =>
    route.fulfill({ contentType: "image/png", body: png }),
  );
  await context.route("**/api/templates", (route) =>
    route.fulfill({ json: [published] }),
  );
  await page.route("**/api/auth", (route) =>
    route.fulfill({ json: { authenticated: true, configured: true } }),
  );
  await page.route("**/api/admin", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: state });
    const body = route.request().postDataJSON();
    if (failSave)
      return route.fulfill({ status: 400, json: { error: "测试保存失败" } });
    assert.equal(body.action, "save");
    assert.equal(body.revision, row.revision);
    row.draft = templateSchema.parse(body.template);
    row.revision++;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("http://localhost:8982/admin");
  await page.getByRole("button", { name: "更改默认展示", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  const pick = (p, name) =>
    p.locator(".background-picker").getByRole("button", { name, exact: true });
  const zoom = (p) => p.getByRole("slider", { name: "背景缩放", exact: true });
  const scale = async (p, value) => {
    await zoom(p).fill(String(value));
    await zoom(p).dispatchEvent("input");
    await zoom(p).dispatchEvent("change");
  };
  const save = async () => {
    await page
      .getByRole("button", { name: "保存当前背景", exact: true })
      .click();
    await expect(page.getByText("草稿已保存", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await page.getByRole("button", { name: "调整背景", exact: true }).click();
  };
  const regionPixels = (p) =>
    p
      .getByRole("img", { name: "收款卡实时预览", exact: true })
      .evaluate((c) => {
        const patch = document.createElement("canvas");
        patch.width = 120;
        patch.height = 60;
        patch
          .getContext("2d")
          .drawImage(c, 0, 0, c.width, c.height / 4, 0, 0, 120, 60);
        return patch.toDataURL();
      });
  const rendered = (p) =>
    expect(
      p.getByRole("button", { name: "下载高清 PNG", exact: true }),
    ).toBeEnabled();
  await pick(page, "测试背景A").click();
  await expect(page.locator(".settings-panel .background-crop")).toHaveCount(0);
  await expect(page.locator(".preview-panel .background-preview-overlay")).toBeVisible();
  await expect(page.locator(".settings-panel").getByRole("slider", { name: "背景缩放", exact: true })).toHaveCount(0);
  await expect(zoom(page)).toBeEnabled();
  await scale(page, 150);
  const move = page.getByRole("button", { name: "拖动背景位置", exact: true });
  await move.scrollIntoViewIfNeeded();
  const bounds = await move.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 25,
    bounds.y + bounds.height / 2 - 18,
    { steps: 4 },
  );
  await page.mouse.up();
  const rotationHandle = page.getByRole("button", { name: "拖动旋转背景", exact: true });
  const rb = await rotationHandle.boundingBox();
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width / 2 + 60, rb.y + rb.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  assert.notEqual(Number(await page.getByRole("slider", { name: "背景旋转", exact: true }).inputValue()), 0);
  await page.getByRole("slider", { name: "背景旋转", exact: true }).fill("0");
  await page.getByRole("button", { name: "右转 90°", exact: true }).click();
  await expect(page.getByRole("slider", { name: "背景旋转", exact: true })).toHaveValue("90");
  await save();
  const a = structuredClone(
    row.draft.defaults.edits.backgroundTransforms[assets[0].src],
  );
  assert.equal(a.scale, 1.5);
  assert.equal(a.rotation, 90);
  assert.ok(a.x > 0 && a.y < 0);
  await rendered(page);
  const aPixels = await regionPixels(page);
  await pick(page, "测试背景B").click();
  await expect(zoom(page)).toHaveValue("100");
  const handle = page.getByRole("button", {
    name: "缩放背景（右下）",
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  const selection = page.locator(".background-crop-selection");
  const beforeResize = await selection.boundingBox();
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x - 20, hb.y - 20, { steps: 4 });
  await page.mouse.up();
  assert.ok(Number(await zoom(page).inputValue()) < 100);
  const afterResize = await selection.boundingBox();
  assert.ok(Math.abs(afterResize.x - beforeResize.x) < 1);
  assert.ok(Math.abs(afterResize.y - beforeResize.y) < 1);
  await scale(page, 80);
  await move.press("ArrowLeft");
  await move.press("ArrowDown");
  await page.getByRole("button", { name: "左转 90°", exact: true }).click();
  failSave = true;
  await page.getByRole("button", { name: "保存当前背景", exact: true }).click();
  await expect(page.getByText("测试保存失败", { exact: true })).toBeVisible();
  await expect(zoom(page)).toHaveValue("80");
  failSave = false;
  await save();
  const b = structuredClone(
    row.draft.defaults.edits.backgroundTransforms[assets[1].src],
  );
  assert.equal(b.scale, 0.8);
  assert.equal(b.rotation, -90);
  assert.ok(b.x < 0 && b.y > 0);
  assert.deepEqual(
    row.draft.defaults.edits.backgroundTransforms[assets[0].src],
    a,
  );
  await rendered(page);
  const bPixels = await regionPixels(page);
  assert.notEqual(aPixels, bPixels);
  await page.reload();
  await page.getByRole("button", { name: "更改默认展示", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "调整背景", exact: true }).click();
  await expect(zoom(page)).toHaveValue("80");
  await pick(page, "测试背景A").click();
  await expect(zoom(page)).toHaveValue("150");
  await rendered(page);
  assert.equal(await regionPixels(page), aPixels);
  await scale(page, 200);
  await page.getByRole("button", { name: "重置当前背景", exact: true }).click();
  await expect(zoom(page)).toHaveValue("150");
  await page
    .locator(".background-crop")
    .screenshot({ path: ".local/qa/background-transform-admin.png" });
  await page.locator(".preview-panel").screenshot({ path: ".local/qa/background-preview-editor.png" });
  published = structuredClone(row.draft);
  const studio = await context.newPage();
  studio.on("pageerror", (e) => errors.push(e.message));
  await studio.goto("http://localhost:8982");
  await studio.getByRole("button", { name: "下一步", exact: true }).click();
  await studio.getByRole("button", { name: "调整背景", exact: true }).click();
  await expect(zoom(studio)).toHaveValue("80");
  await rendered(studio);
  assert.equal(await regionPixels(studio), bPixels);
  await pick(studio, "测试背景A").click();
  await expect(zoom(studio)).toHaveValue("150");
  await rendered(studio);
  assert.equal(await regionPixels(studio), aPixels);
  await pick(studio, "测试背景B").click();
  await expect(zoom(studio)).toHaveValue("80");
  await rendered(studio);
  assert.equal(await regionPixels(studio), bPixels);
  // Export must match the same placement used in the preview.
  const [download] = await Promise.all([
    studio.waitForEvent("download", { timeout: 60000 }),
    studio.getByRole("button", { name: "下载高清 PNG", exact: true }).click(),
  ]).catch(async (error) => {
    console.log(
      await studio.locator('[role="alert"], .error, .toast').allTextContents(),
    );
    await studio.screenshot({
      path: ".local/qa/background-transform-failure.png",
    });
    throw error;
  });
  await download.saveAs(".local/qa/background-transform-export.png");
  const output = readFileSync(".local/qa/background-transform-export.png");
  assert.equal(output.readUInt32BE(16), template.width * 2);
  const comparison = await studio.evaluate(async (png) => {
    const im = new Image();
    im.src = `data:image/png;base64,${png}`;
    await im.decode();
    const c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(im, 0, 0);
    const preview = document.querySelector(
        'canvas[aria-label="收款卡实时预览"]',
      ),
      pc = preview.getContext("2d");
    return [
      [100, 100],
      [300, 120],
      [550, 180],
    ].map(([x, y]) => [
      Array.from(ctx.getImageData(x * 2, y * 2, 1, 1).data),
      Array.from(pc.getImageData(x, y, 1, 1).data),
    ]);
  }, output.toString("base64"));
  comparison.forEach(([a, b]) =>
    a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 3)),
  );
  await studio.getByRole("radio", { name: "自己上传", exact: true }).check();
  await studio
    .locator(".background-upload input[type=file]")
    .setInputFiles({
      name: "用户背景.png",
      mimeType: "image/png",
      buffer: png,
    });
  await expect(zoom(studio)).toHaveValue("100");
  await scale(studio, 125);
  await studio
    .getByRole("button", { name: "拖动背景位置", exact: true })
    .press("ArrowRight");
  await studio.getByRole("radio", { name: "提供的背景", exact: true }).check();
  await expect(zoom(studio)).toHaveValue("80");
  await studio.getByRole("radio", { name: "自己上传", exact: true }).check();
  await expect(zoom(studio)).toHaveValue("125");
  await studio.setViewportSize({ width: 390, height: 844 });
  await expect(studio.locator(".preview-panel .background-preview-overlay")).toBeVisible();
  const mobileBefore = await regionPixels(studio);
  const mobileMove = studio.getByRole("button", { name: "拖动背景位置", exact: true });
  await mobileMove.scrollIntoViewIfNeeded();
  const mb = await mobileMove.boundingBox();
  const touch = await studio.context().newCDPSession(studio);
  const tx = mb.x + mb.width / 2, ty = mb.y + mb.height / 2;
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: tx, y: ty }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: tx + 30, y: ty - 20 }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await touch.detach();
  await rendered(studio);
  assert.notEqual(await regionPixels(studio), mobileBefore);
  const rotate = studio.getByRole("button", { name: "拖动旋转背景", exact: true });
  await rotate.press("ArrowRight");
  await rendered(studio);
  assert.notEqual(await regionPixels(studio), mobileBefore);
  await studio.getByRole("button", { name: "完成调整", exact: true }).click();
  await expect(studio.locator(".background-preview-overlay")).toHaveCount(0);
  await studio.getByRole("button", { name: "调整背景", exact: true }).click();
  assert.equal(
    await studio.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await studio
    .locator(".background-crop")
    .screenshot({ path: ".local/qa/background-transform-mobile.png" });
  await studio.locator(".preview-panel").screenshot({ path: ".local/qa/background-preview-editor-mobile.png" });
  assert.deepEqual(
    row.draft.defaults.edits.backgroundTransforms[assets[0].src],
    a,
  );
  assert.deepEqual(
    row.draft.defaults.edits.backgroundTransforms[assets[1].src],
    b,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Background transform QA passed: drag, corner resize, independent save, failed save recovery, reload, reset, public switching, export, automatic upload editor, mobile. All writes mocked.",
  );
} finally {
  await browser.close();
}
