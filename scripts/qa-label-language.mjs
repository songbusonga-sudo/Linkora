import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import encodeQR from "@paulmillr/qr";

mkdirSync(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:8982");
  await page.locator(".code-upload").first().waitFor();
  const png = await page.evaluate(
    async (svg) => {
      const image = new Image();
      image.src = "data:image/svg+xml," + encodeURIComponent(svg);
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 1500;
      canvas.getContext("2d").fillStyle = "#fff";
      canvas.getContext("2d").fillRect(0, 0, 1000, 1500);
      canvas.getContext("2d").drawImage(image, 200, 400, 600, 600);
      return canvas.toDataURL().split(",")[1];
    },
    encodeQR("wxp://linkora-test-only", "svg", {
      scale: 12,
      border: 4,
      ecc: "high",
    }),
  );
  for (let i = 0; i < 3; i++) {
    await page
      .locator(".code-upload")
      .nth(i)
      .locator("input[type=file]")
      .setInputFiles(
        i === 2
          ? "public/private-assets/layer-7-1.png"
          : {
              name: "code.png",
              mimeType: "image/png",
              buffer: Buffer.from(png, "base64"),
            },
      );
    if (i < 2)
      await page
        .locator(".code-upload")
        .nth(i)
        .getByText("已识别 · 内容已提取")
        .waitFor();
    else await page.getByRole("button", { name: "确认取景" }).click();
  }
  await page.locator(".studio-options > summary").click();
  const preview = page.getByRole("img", {
    name: "收款卡实时预览",
    exact: true,
  });
  const zh = page.getByRole("radio", { name: "中文", exact: true });
  const en = page.getByRole("radio", { name: "英文", exact: true });
  await expect(en).toBeChecked();
  await expect(zh).not.toBeChecked();
  await page.locator(".render-indicator").waitFor({ state: "hidden" });
  const englishPreview = await preview.evaluate((canvas) => canvas.toDataURL());
  const exportImage = async (name) => {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载高清 PNG" }).click();
    const download = await pending;
    assert.equal(await download.failure(), null);
    await download.saveAs(`.local/qa/labels-${name}.png`);
  };
  await exportImage("en");
  await zh.check();
  await expect(zh).toBeChecked();
  await expect(en).not.toBeChecked();
  await expect
    .poll(() => preview.evaluate((canvas) => canvas.toDataURL()))
    .not.toBe(englishPreview);
  await exportImage("zh");
  const differences = await preview.evaluate(async (canvas, src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const old = document.createElement("canvas");
    old.width = canvas.width;
    old.height = canvas.height;
    old.getContext("2d").drawImage(image, 0, 0);
    const a = old
      .getContext("2d")
      .getImageData(0, 0, old.width, old.height).data;
    const b = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let changed = 0,
      outside = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (
        a[i] === b[i] &&
        a[i + 1] === b[i + 1] &&
        a[i + 2] === b[i + 2] &&
        a[i + 3] === b[i + 3]
      )
        continue;
      changed++;
      const x = (i / 4) % canvas.width,
        y = Math.floor(i / 4 / canvas.width);
      if (x < 399 || x >= 1688 || y < 1620 || y >= 1671) outside++;
    }
    return { changed, outside };
  }, englishPreview);
  assert.ok(differences.changed > 1000);
  assert.equal(
    differences.outside,
    0,
    "only the three labels may change; footnotes and QR codes must stay identical",
  );
  await page.screenshot({
    path: ".local/qa/labels-chinese.png",
    fullPage: true,
  });
  await en.check();
  await expect(en).toBeChecked();
  await expect(zh).not.toBeChecked();
  await expect
    .poll(() => preview.evaluate((canvas) => canvas.toDataURL()))
    .toBe(englishPreview);
  await zh.check();
  await page
    .getByRole("button", { name: "恢复模板默认设置", exact: true })
    .click();
  await expect(en).toBeChecked();
  await expect(zh).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await zh.check();
  await expect(zh).toBeChecked();
  await expect(en).not.toBeChecked();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Language QA passed: exclusive choice, exact label-only pixel changes, both PNG downloads, reset and mobile",
  );
} finally {
  await browser.close();
}
