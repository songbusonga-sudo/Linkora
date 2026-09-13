import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";

mkdirSync(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    acceptDownloads: true,
  });
  const [original] = await context.request
    .get("http://localhost:8982/api/templates")
    .then((r) => r.json());
  const template = structuredClone(original);
  const background = template.nodes.find((n) => n.role === "background");
  template.assets = [];
  template.verified = true; // Isolated mocked template, never published to the server.
  if (template.defaults) delete template.defaults.edits.images[background.id];
  const row = {
    id: template.id,
    draft: template,
    published: template.version,
    revision: 1,
  };
  const state = {
    templates: [row],
    assets: [],
    versions: [],
    layers: JSON.parse(
      readFileSync("public/private-assets/layers.json", "utf8"),
    ).layers,
  };
  let published = structuredClone(template);
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const fixture = async (color) =>
    Buffer.from(
      await page.evaluate((color) => {
        const c = document.createElement("canvas");
        c.width = 600;
        c.height = 400;
        const ctx = c.getContext("2d");
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 600, 400);
        return c.toDataURL().split(",")[1];
      }, color),
      "base64",
    );
  const blue = await fixture("#2266bb"),
    red = await fixture("#ee5522");
  await context.route("**/api/assets/qa-background", (route) =>
    route.fulfill({ contentType: "image/png", body: blue }),
  );
  let uploadCount = 0;
  await page.route("**/api/assets", (route) => {
    assert.equal(route.request().method(), "POST");
    assert.ok(
      route
        .request()
        .postDataBuffer()
        .toString()
        .includes('name="category"\r\n\r\nbackground'),
    );
    uploadCount++;
    return route.fulfill({ json: { id: "qa-background" } });
  });
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
    if (body.action === "save") row.draft = body.template;
    else {
      assert.equal(body.action, "publish");
      published = structuredClone(row.draft);
      published.version++;
      row.published = published.version;
    }
    row.revision++;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("http://localhost:8982/admin");
  await page.getByRole("button", { name: "图层与权限", exact: true }).click();
  await page.getByRole("button", { name: "PSD 根目录", exact: true }).click();
  await expect(
    page
      .locator(".psd-browser .layer-list")
      .getByText("可替换背景", { exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".psd-folders")
    .getByRole("button", { name: "可替换背景", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "用户可选背景素材" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新增素材", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增用户可选素材" });
  await expect(dialog.getByRole("combobox")).toHaveValue("background");
  await dialog
    .locator("input[type=file]")
    .setInputFiles({
      name: "蓝色背景.png",
      mimeType: "image/png",
      buffer: blue,
    });
  await expect(
    page
      .getByRole("region", { name: "用户可选背景素材" })
      .getByAltText("1"),
  ).toBeVisible();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText("草稿已保存", { exact: true })).toBeVisible();
  assert.equal(uploadCount, 1);
  assert.equal(row.draft.assets[0].category, "background");
  assert.equal(
    row.draft.nodes.find((n) => n.role === "background").contentEditable,
    true,
  );
  await page.screenshot({
    path: ".local/qa/background-folder.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "发布与历史", exact: true }).click();
  await page.getByRole("checkbox", { name: /已对照 PSD/ }).check();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText("草稿已保存", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "发布新版本", exact: true }).click();
  await expect(
    page.getByText("新版本已发布，已有作品使用的版本保持不变", { exact: true }),
  ).toBeVisible();

  const studio = await context.newPage();
  studio.on("pageerror", (e) => errors.push(e.message));
  await studio.goto("http://localhost:8982");
  await studio.getByRole("button", { name: "下一步", exact: true }).click();
  const canvas = studio.getByRole("img", {
    name: "收款卡实时预览",
    exact: true,
  });
  const provided = studio.getByRole("radio", {
    name: "提供的背景",
    exact: true,
  });
  const own = studio.getByRole("radio", { name: "自己上传", exact: true });
  await expect(provided).toBeChecked();
  await studio
    .getByRole("button", { name: "1", exact: true })
    .click();
  await expect(
    studio.getByRole("button", { name: "1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    studio.getByRole("button", { name: "下载高清 PNG", exact: true }),
  ).toBeEnabled();
  const bluePreview = await canvas.evaluate((c) => c.toDataURL());
  await own.check();
  await studio
    .locator(".background-upload input[type=file]")
    .setInputFiles({
      name: "我的背景.png",
      mimeType: "image/png",
      buffer: red,
    });
  await expect
    .poll(() => canvas.evaluate((c) => c.toDataURL()))
    .not.toBe(bluePreview);
  const redPreview = await canvas.evaluate((c) => c.toDataURL());
  await provided.check();
  await expect(own).not.toBeChecked();
  await expect
    .poll(() => canvas.evaluate((c) => c.toDataURL()))
    .toBe(bluePreview);
  await own.check();
  await expect(provided).not.toBeChecked();
  await expect
    .poll(() => canvas.evaluate((c) => c.toDataURL()))
    .toBe(redPreview);
  const pending = studio.waitForEvent("download");
  await studio
    .getByRole("button", { name: "下载高清 PNG", exact: true })
    .click();
  await (await pending).saveAs(".local/qa/background-upload-export.png");
  const output = readFileSync(".local/qa/background-upload-export.png");
  assert.equal(output.readUInt32BE(16), template.width * 2);
  await studio.screenshot({
    path: ".local/qa/background-upload-choice.png",
    fullPage: true,
  });
  await provided.check();
  await studio
    .getByRole("button", { name: "模板默认背景", exact: true })
    .click();
  await expect(
    studio.getByRole("button", { name: "模板默认背景", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await studio.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await studio.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Background QA passed: folder, upload, mocked save/publish, user presets, remembered own upload, exclusive switching, export, mobile.",
  );
} finally {
  await browser.close();
}
