import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
mkdirSync(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const [template] = await page.request
    .get("http://localhost:8982/api/templates")
    .then((r) => r.json());
  template.assets = [];
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
  await page.route("**/api/auth", (route) =>
    route.fulfill({ json: { authenticated: true, configured: true } }),
  );
  await page.route("**/api/admin", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: state });
    const body = route.request().postDataJSON();
    assert.equal(body.action, "save");
    row.draft = body.template;
    row.revision++;
    return route.fulfill({ json: { ok: true } });
  });
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    c.getContext("2d").fillStyle = "#5689ae";
    c.getContext("2d").fillRect(0, 0, 32, 32);
    return c.toDataURL().split(",")[1];
  });
  const uploads = [];
  let rejectSeven = true;
  await page.route("**/api/assets/*", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(png, "base64"),
    }),
  );
  await page.route("**/api/assets", async (route) => {
    const req = route.request();
    const form = await new Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-type": req.headers()["content-type"] },
      body: req.postDataBuffer(),
    }).formData();
    const name = form.get("file").name,
      category = form.get("category");
    if (name === "7" && rejectSeven) {
      rejectSeven = false;
      return route.fulfill({ status: 500, json: { error: "测试上传失败" } });
    }
    uploads.push({ name, category });
    return route.fulfill({ json: { id: `batch-${uploads.length}.png` } });
  });
  const file = (name) => ({
    name,
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.goto("http://localhost:8982/admin");
  await page.getByRole("button", { name: "图层与权限", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增用户可选素材" });
  const open = async () => {
    await page.getByRole("button", { name: "新增素材", exact: true }).click();
    await expect(dialog.getByRole("combobox")).toHaveValue("background");
  };
  await open();
  await expect(dialog.locator("input[type=file]")).toHaveAttribute(
    "multiple",
    "",
  );
  await page.screenshot({ path: ".local/qa/batch-upload-dialog.png" });
  await dialog
    .locator("input[type=file]")
    .setInputFiles([file("z.png"), file("a.png"), file("b.png")]);
  await expect(dialog).toBeHidden();
  assert.deepEqual(
    uploads.map((a) => a.name),
    ["1", "2", "3"],
  );
  await open();
  const transfer = await page.evaluateHandle((png) => {
    const data = new DataTransfer();
    for (const name of ["拖入一.png", "拖入二.png"])
      data.items.add(
        new File([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], name, {
          type: "image/png",
        }),
      );
    return data;
  }, png);
  await dialog.dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(dialog).toHaveClass(/is-dragging/);
  await dialog.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(dialog).toBeHidden();
  assert.deepEqual(
    uploads.map((a) => a.name),
    ["1", "2", "3", "4", "5"],
  );
  await open();
  await dialog
    .locator("input[type=file]")
    .setInputFiles([file("成功一.png"), file("失败.png"), file("成功二.png")]);
  await expect(dialog.getByRole("alert")).toContainText(
    "失败.png：测试上传失败",
  );
  assert.deepEqual(
    uploads.map((a) => a.name),
    ["1", "2", "3", "4", "5", "6", "7"],
  );
  await dialog.getByRole("button", { name: "重试失败图片" }).click();
  await expect(dialog).toBeHidden();
  assert.equal(uploads.at(-1).name, "8");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText("草稿已保存", { exact: true })).toBeVisible();
  assert.deepEqual(
    row.draft.assets.map((a) => a.name),
    ["1", "2", "3", "4", "5", "6", "7", "8"],
  );
  await page.reload();
  await page.getByRole("button", { name: "图层与权限", exact: true }).click();
  await open();
  await expect(dialog).toContainText("本次从 9 开始");
  await dialog.locator("input[type=file]").setInputFiles([file("再次.png")]);
  await expect(dialog).toBeHidden();
  assert.equal(uploads.at(-1).name, "9");
  await open();
  await dialog.getByRole("combobox").selectOption("avatar");
  await expect(dialog).toContainText("本次从 1 开始");
  await dialog.locator("input[type=file]").setInputFiles([file("头像.png")]);
  await expect(dialog).toBeHidden();
  assert.deepEqual(uploads.at(-1), { name: "1", category: "avatar" });
  await open();
  await dialog
    .locator("input[type=file]")
    .setInputFiles([
      {
        name: "错误.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("invalid"),
      },
    ]);
  await expect(dialog.getByRole("alert")).toContainText(
    "请上传 PNG、JPG 或 WebP 图片",
  );
  assert.equal(uploads.length, 10);
  await dialog.getByRole("button", { name: "关闭新增素材" }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText("草稿已保存", { exact: true })).toBeVisible();
  assert.equal(row.draft.assets.length, 10);
  assert.equal(new Set(row.draft.assets.map((a) => a.id)).size, 10);
  assert.deepEqual(errors, []);
  console.log(
    "Batch upload QA passed: multiple selection, drag/drop, numbering, append after reload, per-category sequence, partial failure retry, invalid file handling, batch save without lost assets.",
  );
} finally {
  await browser.close();
}
