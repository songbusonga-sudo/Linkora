import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import encodeQR from "@paulmillr/qr";

mkdirSync(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const base = process.env.QA_BASE_URL ?? "http://127.0.0.1:8982";
const open = async (options) => {
  const page = await browser.newPage(options);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.locator(".code-upload").first().waitFor();
  await page
    .locator(".preview-placeholder")
    .waitFor({ state: "hidden", timeout: 60000 });
  return page;
};
const noOverflow = async (page) =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
const avatarFixture = async (page) =>
  Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 900;
      c.height = 600;
      const ctx = c.getContext("2d");
      const gradient = ctx.createLinearGradient(0, 0, 900, 600);
      gradient.addColorStop(0, "#efbd9a");
      gradient.addColorStop(1, "#576e97");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 900, 600);
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(450, 300, 120, 0, Math.PI * 2);
      ctx.fill();
      return c.toDataURL().split(",")[1];
    }),
    "base64",
  );

try {
  const desktop = await open({
    viewport: { width: 1260, height: 671 },
    deviceScaleFactor: 2,
  });
  const layout = await desktop.evaluate(() => ({
    scale: Number(
      getComputedStyle(document.querySelector(".public-studio")).zoom,
    ),
    header: document.querySelector(".header").getBoundingClientRect().height,
    workspace: document.querySelector(".workspace").getBoundingClientRect()
      .width,
  }));
  assert.equal(layout.scale, 0.67);
  assert.ok(Math.abs(layout.header - 82 * 0.67) < 1);
  assert.ok(Math.abs(layout.workspace - 1260 * 0.67) < 1);
  await expect(desktop.locator(".studio-step-progress li")).toHaveCount(3);
  await noOverflow(desktop);
  await desktop.screenshot({ path: ".local/qa/public-desktop-67-at-100.png" });
  await desktop.getByRole("button", { name: "下一步", exact: true }).click();
  await desktop
    .locator(".avatar-edit input[type=file]")
    .first()
    .setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: await avatarFixture(desktop),
    });
  const desktopDialog = desktop.getByRole("dialog");
  await desktopDialog.waitFor();
  const overlay = await desktop.locator(".modal-backdrop").boundingBox();
  assert.ok(
    Math.abs(overlay.width - 1260) < 1 && Math.abs(overlay.height - 671) < 1,
    "scaled modal still covers viewport",
  );
  const handle = desktop.getByRole("button", {
    name: "调整头像选区大小（右下）",
    exact: true,
  });
  const before = await desktop.locator(".avatar-crop-selection").boundingBox();
  const handleBox = await handle.boundingBox();
  await desktop.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await desktop.mouse.down();
  await desktop.mouse.move(
    handleBox.x + handleBox.width / 2 - 15,
    handleBox.y + handleBox.height / 2 - 15,
    { steps: 5 },
  );
  await desktop.mouse.up();
  assert.ok(
    (await desktop.locator(".avatar-crop-selection").boundingBox()).width <
      before.width - 20,
    "crop works at 0.67 CSS zoom",
  );
  await desktop.getByRole("button", { name: "取消", exact: true }).click();
  await desktop.close();
  console.log(
    "Desktop: 67% proportions at default browser zoom, modal coverage and mouse crop passed.",
  );

  const mobile = await open({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const nav = mobile.getByRole("list", { name: "制作步骤" });
  await expect(nav).toBeVisible();
  await expect(
    mobile.getByRole("region", { name: "头像与背景", exact: true }),
  ).toBeHidden();
  await expect(mobile.locator(".panel-heading")).toBeHidden();
  await expect(
    mobile.getByRole("button", { name: "查看大图", exact: true }),
  ).toHaveCount(0);
  await expect(mobile.locator(".footer-hint")).toContainText(
    "本模板仅供个人免费使用",
  );
  const stage = await mobile.locator(".preview-stage").boundingBox();
  const artboard = await mobile.locator(".artboard").boundingBox();
  assert.ok(
    Math.abs(stage.width - artboard.width) < 1 && artboard.width > 300,
    "mobile preview fills the stage",
  );
  await mobile.screenshot({ path: ".local/qa/public-mobile-upload.png" });
  // Published defaults may use intentionally faint artwork. Use a known
  // decodable style for the uploaded test QR before checking its export.
  for (let i = 0; i < 2; i++) {
    const qrOptions = mobile
      .locator(".code-upload")
      .nth(i)
      .locator(".code-style-options");
    await qrOptions.locator("summary").tap();
    await qrOptions
      .getByRole("button", { name: "恢复默认", exact: true })
      .tap();
    await qrOptions.locator("summary").tap();
  }
  const qrPng = await mobile.evaluate(
    (matrix) => {
      const c = document.createElement("canvas");
      c.width = c.height = matrix.length * 12;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "black";
      matrix.forEach((row, y) =>
        row.forEach((cell, x) => {
          if (cell) ctx.fillRect(x * 12, y * 12, 12, 12);
        }),
      );
      return c.toDataURL().split(",")[1];
    },
    encodeQR("wxp://linkora-mobile-qa", "raw", { border: 4, ecc: "high" }),
  );
  await mobile
    .locator(".code-upload input[type=file]")
    .first()
    .setInputFiles({
      name: "wechat.png",
      mimeType: "image/png",
      buffer: Buffer.from(qrPng, "base64"),
    });
  await expect(mobile.locator(".code-upload.has-code")).toHaveCount(1);
  await mobile.getByRole("button", { name: "下一步", exact: true }).tap();
  await expect(mobile.locator(".studio")).toHaveAttribute("data-step", "2");
  await expect(mobile.locator(".code-uploads")).toBeHidden();
  const signature = mobile.getByRole("textbox", { name: "署名", exact: true });
  await mobile.getByRole("button", { name: "下一步", exact: true }).tap();
  await signature.fill("手机端测试");
  assert.equal(
    await signature.evaluate((el) => getComputedStyle(el).fontSize),
    "16px",
  );
  await mobile.getByRole("button", { name: "上一步", exact: true }).tap();
  await mobile
    .locator(".avatar-edit input[type=file]")
    .first()
    .setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: await avatarFixture(mobile),
    });
  await mobile.getByRole("dialog").waitFor();
  assert.equal(
    await mobile.evaluate(() => document.body.style.overflow),
    "hidden",
  );
  await mobile.screenshot({ path: ".local/qa/public-mobile-crop.png" });
  const cdp = await mobile.context().newCDPSession(mobile);
  const touchDrag = async (locator, dx, dy) => {
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let i = 1; i <= 5; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + (dx * i) / 5, y: y + (dy * i) / 5 }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  const selection = mobile.locator(".avatar-crop-selection");
  const original = await selection.boundingBox();
  await touchDrag(
    mobile.getByRole("button", {
      name: "调整头像选区大小（右下）",
      exact: true,
    }),
    -20,
    -20,
  );
  const resized = await selection.boundingBox();
  assert.ok(resized.width < original.width - 30, "finger resizes crop");
  await touchDrag(
    mobile.getByRole("button", { name: "移动头像选区", exact: true }),
    12,
    8,
  );
  const moved = await selection.boundingBox();
  assert.ok(
    Math.abs(moved.x - resized.x - 12) < 2 &&
      Math.abs(moved.y - resized.y - 8) < 2,
    "finger moves crop",
  );
  await mobile.getByRole("button", { name: "确认取景", exact: true }).tap();
  await expect(mobile.getByRole("dialog")).toHaveCount(0);
  assert.equal(await mobile.evaluate(() => document.body.style.overflow), "");
  await expect(mobile.getByAltText("主头像", { exact: true })).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
  await mobile.getByRole("button", { name: "上一步", exact: true }).tap();
  await expect(mobile.locator(".code-upload.has-code")).toHaveCount(1);
  await mobile.getByRole("button", { name: "下一步", exact: true }).tap();
  await mobile.getByRole("button", { name: "下一步", exact: true }).tap();
  await expect(signature).toHaveValue("手机端测试");
  await mobile.screenshot({ path: ".local/qa/public-mobile-content.png" });
  const save = mobile.getByRole("button", {
    name: "下载高清 PNG",
    exact: true,
  });
  await expect(save).toBeEnabled({ timeout: 30000 });
  const download = mobile.waitForEvent("download", { timeout: 60000 });
  await save.tap();
  const file = await Promise.race([
    download,
    mobile
      .locator(".toast.error")
      .waitFor({ timeout: 60000 })
      .then(async () => {
        throw new Error(await mobile.locator(".toast.error").innerText());
      }),
  ]);
  assert.equal(await file.failure(), null);
  await file.saveAs(".local/qa/public-mobile-export.png");
  const bytes = readFileSync(".local/qa/public-mobile-export.png");
  assert.equal(bytes.readUInt32BE(16), 4096);
  assert.equal(bytes.readUInt32BE(20), 4096);
  await noOverflow(mobile);
  await mobile.close();
  console.log(
    "Mobile: full-stage template, compact controls, upload, section switching, retained edits, touch crop and 4096px export passed.",
  );

  for (const [width, height] of [
    [320, 740],
    [430, 932],
    [768, 1024],
    [844, 390],
  ]) {
    const page = await open({
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
    });
    await page.getByRole("button", { name: "下一步", exact: true }).tap();
    await expect(page.locator(".studio")).toHaveAttribute("data-step", "2");
    await noOverflow(page);
    const footer = await page.locator(".panel-footer").boundingBox();
    assert.ok(
      Math.abs(footer.y + footer.height - height) < 1,
      "save actions stay on screen",
    );
    await page.screenshot({ path: `.local/qa/public-mobile-${width}.png` });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Responsive checks passed at 320, 390, 430, 768 and 844px, with no browser errors.",
  );
} finally {
  await browser.close();
}
