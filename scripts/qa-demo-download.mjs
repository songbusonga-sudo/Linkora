import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import encodeQR from "@paulmillr/qr";

mkdirSync(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    acceptDownloads: true,
  });
  const templates = await context.request
    .get("http://localhost:8982/api/templates")
    .then((r) => r.json());
  const template = structuredClone(templates[0]);
  if (template.defaults) template.defaults.codes = {};
  const errors = [];
  const download = async (page, name) => {
    const button = page.getByRole("button", {
      name: "下载高清 PNG",
      exact: true,
    });
    await expect(button).toBeEnabled();
    const pending = page.waitForEvent("download");
    await button.click();
    const file = await pending;
    assert.equal(await file.failure(), null);
    const output = `.local/qa/demo-${name}.png`;
    await file.saveAs(output);
    const png = readFileSync(output);
    assert.equal(png.readUInt32BE(16), template.width * 2);
    assert.equal(png.readUInt32BE(20), template.height * 2);
  };
  const next = async (page) => {
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await expect(page.locator(".studio-options")).toHaveAttribute("open", "");
    await expect(page.locator(".studio-options summary")).toBeFocused();
    await expect(
      page.getByRole("textbox", { name: "署名", exact: true }),
    ).toBeVisible();
  };
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/templates", (route) =>
    route.fulfill({ json: [template] }),
  );
  await page.goto("http://localhost:8982");
  await expect(page.locator(".count-badge")).toHaveText("0 / 3");
  await download(page, "empty");
  await next(page);
  await page
    .getByRole("textbox", { name: "署名", exact: true })
    .fill("功能演示");
  await download(page, "edited-empty");
  const png = await page.evaluate(
    async (svg) => {
      const image = new Image();
      image.src = "data:image/svg+xml," + encodeURIComponent(svg);
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 1500;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 1000, 1500);
      ctx.drawImage(image, 200, 400, 600, 600);
      return canvas.toDataURL().split(",")[1];
    },
    encodeQR("wxp://linkora-test-only", "svg", {
      scale: 12,
      border: 4,
      ecc: "high",
    }),
  );
  await page
    .locator(".code-upload")
    .first()
    .locator("input[type=file]")
    .setInputFiles({
      name: "demo.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(page.locator(".count-badge")).toHaveText("1 / 3");
  await download(page, "partial");
  await page.setViewportSize({ width: 390, height: 844 });
  await next(page);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: ".local/qa/demo-mobile.png", fullPage: true });

  const admin = await context.newPage();
  admin.on("pageerror", (e) => errors.push(e.message));
  const row = {
    id: template.id,
    draft: template,
    revision: 1,
    published: template.version,
  };
  const state = {
    templates: [row],
    assets: [],
    versions: [],
    layers: JSON.parse(
      readFileSync("public/private-assets/layers.json", "utf8"),
    ).layers,
  };
  await admin.route("**/api/auth", (route) =>
    route.fulfill({ json: { authenticated: true, configured: true } }),
  );
  let saves = 0;
  await admin.route("**/api/admin", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: state });
    const body = route.request().postDataJSON();
    assert.equal(body.action, "save");
    row.draft = body.template;
    row.revision++;
    saves++;
    return route.fulfill({ json: { ok: true } });
  });
  await admin.goto("http://localhost:8982/admin");
  await admin
    .getByRole("button", { name: "更改默认展示", exact: true })
    .click();
  await expect(admin.locator(".count-badge")).toHaveText("0 / 3");
  await download(admin, "admin-empty");
  await next(admin);
  await admin
    .getByRole("textbox", { name: "署名", exact: true })
    .fill("后台功能演示");
  await download(admin, "admin-edited");
  await admin.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(admin.getByText("草稿已保存", { exact: true })).toBeVisible();
  assert.equal(saves, 1);
  assert.deepEqual(row.draft.defaults.codes, {});
  assert.equal(
    row.draft.defaults.edits.texts[
      template.nodes.find((n) => n.role === "signature").id
    ],
    "后台功能演示",
  );
  await admin.reload();
  await admin
    .getByRole("button", { name: "更改默认展示", exact: true })
    .click();
  await next(admin);
  await expect(
    admin.getByRole("textbox", { name: "署名", exact: true }),
  ).toHaveValue("后台功能演示");
  await expect(
    admin.getByRole("button", { name: "下载高清 PNG", exact: true }),
  ).toBeEnabled();
  await admin.screenshot({ path: ".local/qa/demo-admin.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "Demo QA passed: next in both editors, zero/partial uploads download, edited admin export, draft save/reload with no codes, mobile layout.",
  );
} finally {
  await browser.close();
}
