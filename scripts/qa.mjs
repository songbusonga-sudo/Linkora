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
await page.goto("http://localhost:8982");
await page.getByRole("img", { name: "收款卡实时预览", exact: true }).waitFor();
await page.waitForTimeout(700);
await page.screenshot({ path: ".local/qa/desktop.png", fullPage: true });
assert.equal(await page.locator(".code-upload input[type=file]").count(), 3);
assert.equal(await page.locator(".steps").count(), 0);
assert.equal(
  await page.getByRole("button", { name: "下载高清 PNG" }).isDisabled(),
  false,
);
const previewBounds = await page.locator(".preview-panel").boundingBox();
const settingsBounds = await page.locator(".settings-panel").boundingBox();
assert.ok(previewBounds.x + previewBounds.width <= settingsBounds.x);
assert.equal(await page.locator(".preview-panel button").count(), 0);
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
  await page.getByRole("button", { name: "下载高清 PNG" }).isDisabled(),
  false,
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
await page.getByText("已自动裁剪 · 模板尺寸", { exact: true }).waitFor();
assert.equal(await page.getByRole("dialog").count(), 0);
await page.locator(".studio-options summary").click();
await page
  .getByRole("textbox", { name: "署名", exact: true })
  .fill("测试署名一二三四五六七八九十");
assert.ok(
  Array.from(
    await page.getByRole("textbox", { name: "署名", exact: true }).inputValue(),
  ).length <= 12,
);
const liveTiming = await page.evaluate(async () => {
  const input = document.querySelector('input[aria-label="署名"]');
  const canvas = document.querySelector('canvas[aria-label="收款卡实时预览"]');
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  ).set;
  const timings = [];
  for (let i = 0; i < 8; i++) {
    const before = canvas.dataset.revision;
    const start = performance.now();
    setter.call(input, "实时更新" + i);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    while (
      canvas.dataset.revision === before &&
      performance.now() - start < 2000
    ) {
      await new Promise(requestAnimationFrame);
    }
    if (canvas.dataset.revision === before)
      throw Error("Preview failed to update");
    timings.push(performance.now() - start);
  }
  return timings;
});
console.log("Text input to canvas update (ms):", liveTiming.map(Math.round));
assert.ok(
  liveTiming.slice(1).every((ms) => ms < 160),
  "warm preview must update before the former debounce delay",
);
await page.getByRole("button", { name: "放大预览" }).click();
await page.getByRole("img", { name: "高清成品预览", exact: true }).waitFor();
await page.getByRole("button", { name: "关闭预览 ×" }).click();
await page.getByRole("button", { name: "微信赞赏码：更改图层与头像", exact: true }).click();
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
  .locator("#code-editor-reward .content-controls input[type=file]")
  .setInputFiles(".local/qa/transparent-avatar.png");
await page.getByRole("button", { name: "确认取景" }).click();
await page.waitForTimeout(350);
await page.locator(".render-indicator").waitFor({ state: "hidden" });
const center = await page
  .getByRole("img", { name: "收款卡实时预览", exact: true })
  .evaluate((c) =>
    Array.from(c.getContext("2d").getImageData(1024, 1381, 1, 1).data),
  );
assert.deepEqual(
  center,
  [255, 255, 255, 255],
  "transparent avatar must preserve the PSD white cover",
);
await page.getByRole("button", { name: "微信收款码：更改码样式", exact: true }).click();
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
await page.locator(".render-indicator").waitFor({ state: "hidden" });
assert.equal(await page.locator(".steps li").count(), 0);
assert.equal(await page.getByRole("button", { name: "下一步" }).count(), 1);
assert.equal(await page.getByRole("button", { name: "开始检查" }).count(), 0);
assert.equal(await page.getByRole("checkbox").count(), 0);
const styledDownloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "下载高清 PNG" }).click();
const styledDownload = await styledDownloadPromise;
assert.equal(await styledDownload.failure(), null);
await page.getByText("高清图片已下载，感谢每一份心意。").waitFor();
await page
  .getByRole("button", { name: "恢复模板默认设置", exact: true })
  .click();
await page
  .getByText("高清图片已下载，感谢每一份心意。")
  .waitFor({ state: "hidden" });
await page.locator(".render-indicator").waitFor({ state: "hidden" });
const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "下载高清 PNG" }).click();
const download = await downloadPromise;
await download.saveAs(".local/qa/export.png");
const exportedPng = readFileSync(".local/qa/export.png");
assert.equal(exportedPng.subarray(1, 4).toString(), "PNG");
assert.equal(exportedPng.readUInt32BE(16), 4096);
assert.equal(exportedPng.readUInt32BE(20), 4096);
await page.screenshot({ path: ".local/qa/completed.png", fullPage: true });
const mobile = await context.newPage();
await mobile.setViewportSize({ width: 390, height: 844 });
await mobile.goto("http://localhost:8982");
await mobile
  .getByRole("img", { name: "收款卡实时预览", exact: true })
  .waitFor();
await mobile.screenshot({ path: ".local/qa/mobile.png", fullPage: true });
assert.equal(
  await mobile.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  ),
  false,
);
const admin = await context.newPage();
const unauthorized = await context.request.get(
  "http://localhost:8982/api/admin",
);
assert.equal(unauthorized.status(), 401);
await admin.goto("http://localhost:8982/admin");
const password = readFileSync(".local/admin-access.txt", "utf8").match(
  /Password: (.+)/,
)[1];
await admin.getByLabel("管理员密码").fill(password);
await admin.getByRole("button", { name: "进入工作台" }).click();
await admin.getByRole("button", { name: "保存草稿" }).waitFor();
await admin.screenshot({ path: ".local/qa/admin.png", fullPage: true });
const denied = await context.request.post("http://localhost:8982/api/admin", {
  data: { action: "copy", id: "starlight" },
  headers: { Origin: "https://invalid.example" },
});
assert.equal(denied.status(), 403);
const current = await context.request
  .get("http://localhost:8982/api/admin")
  .then((r) => r.json());
const bad = structuredClone(current.templates[0].draft);
bad.nodes.find((n) => n.role === "reward").styleEditable = true;
const invalid = await context.request.post("http://localhost:8982/api/admin", {
  headers: { Origin: "http://localhost:8982" },
  data: {
    action: "save",
    id: bad.id,
    template: bad,
    revision: current.templates[0].revision,
  },
});
assert.equal(invalid.status(), 400);
const upload = await context.request.post("http://localhost:8982/api/assets", {
  headers: { Origin: "http://localhost:8982" },
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
  "http://localhost:8982/api/assets",
  {
    headers: { Origin: "http://localhost:8982" },
    data: { id: assetId, name: "qa-renamed", distributable: false },
  },
);
assert.equal(renamed.status(), 200);
const removed = await context.request.delete(
  "http://localhost:8982/api/assets",
  { headers: { Origin: "http://localhost:8982" }, data: { id: assetId } },
);
assert.equal(removed.status(), 200);
assert.equal(
  (
    await context.request.get("http://localhost:8982/api/assets/" + assetId)
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
        "optional code uploads",
        "full screenshot decode",
        "automatic reward crop without manual resize",
        "signature limit",
        "QR style reset",
        "single-page upload and direct download with controls on the right",
        "4096 PNG download",
        "admin authentication",
        "cross-origin mutation rejected",
        "unverified publication blocked",
        "low-opacity style downloads without verification blocking",
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
