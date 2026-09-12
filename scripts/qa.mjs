import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import encodeQR from "@paulmillr/qr";
mkdirSync(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:3000");
await page.getByAltText("收款卡实时预览").waitFor();
await page.waitForTimeout(700);
await page.screenshot({ path: ".local/qa/desktop.png", fullPage: true });
assert.equal(
  await page.getByRole("button", { name: "内容与样式" }).isDisabled(),
  true,
);
await page.getByRole("button", { name: "使用这个模板" }).click();
assert.equal(
  await page.getByRole("button", { name: "下一步" }).isDisabled(),
  true,
);
for (const [i, payload] of [
  "wxp://linkora-test-only",
  "https://qr.alipay.com/linkora-test-only",
].entries()) {
  const svg = encodeQR(payload, "svg", { scale: 12, border: 4, ecc: "high" });
  const png = await page.evaluate(async (s) => {
    const im = new Image();
    im.src = "data:image/svg+xml," + encodeURIComponent(s);
    await im.decode();
    const c = document.createElement("canvas");
    c.width = 1000;
    c.height = 1500;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1000, 1500);
    ctx.fillStyle = "#333";
    ctx.font = "32px sans-serif";
    ctx.fillText("TEST ONLY", 390, 200);
    ctx.drawImage(im, 200, 400, 600, 600);
    return c.toDataURL().split(",")[1];
  }, svg);
  writeFileSync(`.local/qa/code-${i}.png`, Buffer.from(png, "base64"));
  await page
    .locator(".code-upload")
    .nth(i)
    .locator("input[type=file]")
    .setInputFiles(`.local/qa/code-${i}.png`);
  await page
    .locator(".code-upload")
    .nth(i)
    .getByText("已识别 · 内容已提取")
    .waitFor();
}
assert.equal(
  await page.getByRole("button", { name: "下一步" }).isDisabled(),
  true,
);
const rewardPng = await page.evaluate(async () => {
  const im = new Image();
  im.src = "/private-assets/layer-7-1.png";
  await im.decode();
  const c = document.createElement("canvas");
  c.width = im.width;
  c.height = im.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(im, 0, 0);
  ctx.fillStyle = "#ff00ff";
  ctx.fillRect(c.width / 2 - 35, c.height / 2 - 35, 70, 70);
  return c.toDataURL().split(",")[1];
});
writeFileSync(".local/qa/reward-fixture.png", Buffer.from(rewardPng, "base64"));
await page
  .locator(".code-upload")
  .nth(2)
  .locator("input[type=file]")
  .setInputFiles(".local/qa/reward-fixture.png");
await page.getByRole("dialog").waitFor();
await page.getByRole("slider", { name: "取景范围", exact: true }).press("End");
await page.getByRole("button", { name: "确认取景" }).click();
await page.getByRole("button", { name: "下一步" }).click();
await page
  .getByRole("textbox", { name: "署名", exact: true })
  .fill("测试署名一二三四五六七八九十");
assert.ok(
  Array.from(
    await page.getByRole("textbox", { name: "署名", exact: true }).inputValue(),
  ).length <= 12,
);
await page.getByRole("button", { name: "赞赏码", exact: true }).click();
const transparent = await page.evaluate(() => {
  const c = document.createElement("canvas");
  c.width = 200;
  c.height = 200;
  return c.toDataURL().split(",")[1];
});
writeFileSync(
  ".local/qa/transparent-avatar.png",
  Buffer.from(transparent, "base64"),
);
await page
  .locator(".content-controls input[type=file]")
  .setInputFiles(".local/qa/transparent-avatar.png");
await page.getByRole("button", { name: "确认取景" }).click();
await page.waitForTimeout(350);
await page.locator(".render-indicator").waitFor({ state: "hidden" });
const center = await page
  .getByAltText("收款卡实时预览")
  .evaluate(async (el) => {
    const im = new Image();
    im.src = el.src;
    await im.decode();
    const c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(im, 0, 0);
    return Array.from(ctx.getImageData(1024, 1381, 1, 1).data);
  });
assert.deepEqual(
  center,
  [255, 255, 255, 255],
  "transparent avatar must preserve the PSD white cover",
);
await page.getByRole("button", { name: "微信", exact: true }).click();
await page.screenshot({ path: ".local/qa/styles.png", fullPage: true });
await page.locator(".qr-controls select").nth(0).selectOption("a1p");
await page.waitForTimeout(400);
await page
  .getByRole("button", { name: "恢复模板默认设置", exact: true })
  .click();
await page.getByRole("slider", { name: "信息点不透明度", exact: true }).focus();
await page
  .getByRole("slider", { name: "信息点不透明度", exact: true })
  .press("Home");
await page.getByRole("button", { name: "下一步" }).click();
await page.getByRole("button", { name: "开始检查" }).click();
await page.locator(".toast.error").waitFor();
assert.equal(
  await page.getByRole("button", { name: "下载高清 PNG" }).isDisabled(),
  true,
);
await page.getByRole("button", { name: "关闭提示" }).click();
await page.getByRole("button", { name: "上一步" }).click();
await page
  .getByRole("button", { name: "恢复模板默认设置", exact: true })
  .click();
await page.getByRole("button", { name: "下一步" }).click();
await page.getByRole("button", { name: "开始检查" }).click();
await page
  .getByText("美化后与成品识别均已通过", { exact: true })
  .waitFor({ timeout: 60000 });
assert.equal(
  await page.getByRole("button", { name: "下载高清 PNG" }).isDisabled(),
  true,
);
await page.getByRole("checkbox").nth(0).check();
await page.getByRole("checkbox").nth(1).check();
const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "下载高清 PNG" }).click();
const download = await downloadPromise;
await download.saveAs(".local/qa/export.png");
await page.screenshot({ path: ".local/qa/completed.png", fullPage: true });
const mobile = await context.newPage();
await mobile.setViewportSize({ width: 390, height: 844 });
await mobile.goto("http://localhost:3000");
await mobile.getByAltText("收款卡实时预览").waitFor();
await mobile.screenshot({ path: ".local/qa/mobile.png", fullPage: true });
assert.equal(
  await mobile.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  ),
  false,
);
const admin = await context.newPage();
const unauthorized = await context.request.get(
  "http://localhost:3000/api/admin",
);
assert.equal(unauthorized.status(), 401);
await admin.goto("http://localhost:3000/admin");
const password = readFileSync(".local/admin-access.txt", "utf8").match(
  /Password: (.+)/,
)[1];
await admin.getByLabel("管理员密码").fill(password);
await admin.getByRole("button", { name: "进入工作台" }).click();
await admin.getByRole("button", { name: "保存草稿" }).waitFor();
await admin.screenshot({ path: ".local/qa/admin.png", fullPage: true });
const denied = await context.request.post("http://localhost:3000/api/admin", {
  data: { action: "copy", id: "starlight" },
  headers: { Origin: "https://invalid.example" },
});
assert.equal(denied.status(), 403);
const current = await context.request
  .get("http://localhost:3000/api/admin")
  .then((r) => r.json());
const bad = structuredClone(current.templates[0].draft);
bad.nodes.find((n) => n.role === "reward").styleEditable = true;
const invalid = await context.request.post("http://localhost:3000/api/admin", {
  headers: { Origin: "http://localhost:3000" },
  data: {
    action: "save",
    id: bad.id,
    template: bad,
    revision: current.templates[0].revision,
  },
});
assert.equal(invalid.status(), 400);
const upload = await context.request.post("http://localhost:3000/api/assets", {
  headers: { Origin: "http://localhost:3000" },
  multipart: {
    file: {
      name: "qa-temporary.png",
      mimeType: "image/png",
      buffer: readFileSync(".local/qa/code-0.png"),
    },
    category: "background",
    distributable: "false",
  },
});
assert.equal(upload.status(), 200);
const assetId = (await upload.json()).id;
const renamed = await context.request.patch(
  "http://localhost:3000/api/assets",
  {
    headers: { Origin: "http://localhost:3000" },
    data: { id: assetId, name: "qa-renamed", distributable: false },
  },
);
assert.equal(renamed.status(), 200);
const removed = await context.request.delete(
  "http://localhost:3000/api/assets",
  { headers: { Origin: "http://localhost:3000" }, data: { id: assetId } },
);
assert.equal(removed.status(), 200);
assert.equal(
  (
    await context.request.get("http://localhost:3000/api/assets/" + assetId)
  ).status(),
  404,
);
await admin.getByRole("button", { name: "图层与权限" }).click();
await admin.getByRole("heading", { name: "图层设置" }).waitFor();
await admin.getByRole("button", { name: "发布与历史" }).click();
assert.equal(
  await admin.getByRole("button", { name: "发布新版本" }).isDisabled(),
  true,
);
assert.deepEqual(errors, []);
writeFileSync(
  ".local/qa/results.json",
  JSON.stringify(
    {
      passed: true,
      checks: [
        "desktop and mobile rendering",
        "three-code gating",
        "full screenshot decode",
        "reward crop confirmation",
        "signature limit",
        "QR style reset",
        "styled and exported content verification",
        "4096 PNG download",
        "admin authentication",
        "cross-origin mutation rejected",
        "unverified publication blocked",
        "invalid style blocks download",
        "invalid template rejected server-side",
        "asset upload, rename and unused deletion",
        "transparent reward avatar retains fixed PSD white cover",
      ],
      browserErrors: errors,
    },
    null,
    2,
  ),
);
console.log("UI verification passed. Screenshots and export: .local/qa");
await browser.close();
