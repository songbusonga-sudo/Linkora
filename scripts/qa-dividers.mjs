import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import encodeQR from "@paulmillr/qr";

mkdirSync(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.dividerDraws = [];
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
      if (
        source instanceof HTMLImageElement &&
        /\/layer-(3-\d+|4)\.png$/.test(source.src)
      ) {
        window.dividerDraws.push({
          src: source.src.split("/").pop(),
          width: this.canvas.width,
        });
      }
      return original.call(this, source, ...args);
    };
  });
  await page.goto("http://localhost:8982");
  const templates = await (
    await page.request.get("http://localhost:8982/api/templates")
  ).json();
  const option = templates[0].options.find((item) => item.id === "dividers");
  assert.equal(option.choices.length, 73);
  assert.equal(
    templates[0].nodes.some((node) => node.id === "4"),
    false,
  );
  await page.locator(".studio-options summary").click();
  const picker = page.getByRole("group", { name: "分割线", exact: true });
  const select = picker.getByRole("combobox", { name: "分割线", exact: true });
  const settle = () =>
    page.waitForFunction(() => {
      const canvas = document.querySelector(
        'canvas[aria-label="收款卡实时预览"]',
      );
      return (
        canvas?.dataset.revision && !document.querySelector(".render-indicator")
      );
    });
  await settle();
  assert.equal(await select.inputValue(), option.defaultId);
  assert.equal(await select.locator("option").count(), 73);
  assert.notEqual(option.choices[71].name, option.choices[72].name);

  async function change(action, expected) {
    const revision = await page
      .locator('canvas[aria-label="收款卡实时预览"]')
      .getAttribute("data-revision");
    await page.evaluate(() => {
      window.dividerDraws = [];
    });
    await action();
    await page.waitForFunction(
      (previous) =>
        document.querySelector('canvas[aria-label="收款卡实时预览"]').dataset
          .revision !== previous,
      revision,
    );
    await settle();
    assert.equal(await select.inputValue(), expected);
    assert.deepEqual(await page.evaluate(() => window.dividerDraws), [
      { src: `layer-${expected}.png`, width: 2048 },
    ]);
  }
  await change(
    () => picker.getByRole("button", { name: "下一个分割线" }).click(),
    "3-72",
  );
  await change(
    () => picker.getByRole("button", { name: "下一个分割线" }).click(),
    "3-0",
  );
  await change(
    () => picker.getByRole("button", { name: "上一个分割线" }).click(),
    "3-72",
  );
  for (const choice of option.choices) {
    await change(() => select.selectOption(choice.id), choice.id);
    assert.equal(
      await picker.locator("img").evaluate(async (image) => {
        await image.decode();
        return image.naturalWidth > 0;
      }),
      true,
    );
  }
  // A burst of navigation must keep only the newest render in the preview.
  await picker
    .getByRole("button", { name: "下一个分割线" })
    .evaluate((button) => {
      for (let i = 0; i < 10; i++) button.click();
    });
  await settle();
  await change(
    () => picker.getByRole("button", { name: "恢复默认" }).click(),
    option.defaultId,
  );
  await picker.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/qa/dividers-desktop.png",
    fullPage: true,
  });

  // Exercise the actual download with a non-default divider and synthetic codes.
  for (const [index, content] of [
    "wxp://divider-test",
    "https://qr.alipay.com/divider-test",
    "reward-test",
  ].entries()) {
    const svg = encodeQR(content, "svg", { scale: 12, border: 4, ecc: "high" });
    const png = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = "data:image/svg+xml," + encodeURIComponent(source);
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext("2d").drawImage(image, 0, 0);
      return canvas.toDataURL().split(",")[1];
    }, svg);
    await page
      .locator(".code-upload")
      .nth(index)
      .locator("input[type=file]")
      .setInputFiles({
        name: `divider-code-${index}.png`,
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      });
    if (index < 2)
      await page
        .locator(".code-upload")
        .nth(index)
        .getByText("已识别 · 内容已提取")
        .waitFor();
    else await page.getByRole("button", { name: "确认取景" }).click();
  }
  await settle();
  await change(() => select.selectOption("3-0"), "3-0");
  await page.evaluate(() => {
    window.dividerDraws = [];
  });
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载高清 PNG" }).click();
  const download = await pendingDownload;
  await download.saveAs(".local/qa/divider-export.png");
  assert.deepEqual(
    await page.evaluate(() =>
      window.dividerDraws.filter((draw) => draw.width === 4096),
    ),
    [{ src: "layer-3-0.png", width: 4096 }],
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await picker.scrollIntoViewIfNeeded();
  await change(
    () => picker.getByRole("button", { name: "下一个分割线" }).click(),
    "3-1",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: ".local/qa/dividers-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  writeFileSync(
    ".local/qa/dividers-results.json",
    JSON.stringify(
      {
        passed: true,
        choices: 73,
        singleDividerPerRender: true,
        export: "4096 PNG, one selected divider",
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "73 dividers passed: single rendering, arrows, wrapping, direct selection, reset, mobile and export.",
  );
} finally {
  await browser.close();
}
