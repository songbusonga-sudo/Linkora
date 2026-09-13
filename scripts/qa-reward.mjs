import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import encodeQR from "@paulmillr/qr";
mkdirSync(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:8982");
  const templates = await page.request
    .get("http://localhost:8982/api/templates")
    .then((r) => r.json());
  const t = templates[0];
  const canvas = page.getByRole("img", { name: "收款卡实时预览", exact: true });
  await expect(canvas).toHaveAttribute("data-revision", /\d+/);
  await page
    .locator(".code-upload")
    .nth(2)
    .locator("input[type=file]")
    .setInputFiles("public/private-assets/layer-7-1.png");
  await page.getByText("已自动裁剪 · 模板尺寸", { exact: true }).waitFor();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("微调取景与对齐", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "微信赞赏码：更改图层与头像", exact: true })
    .click();
  const controls = page.getByRole("region", {
    name: "微信赞赏码编辑",
    exact: true,
  });
  await expect(controls.getByRole("slider")).toHaveCount(0);
  await expect(controls.locator("input[type=file]")).toHaveCount(2);
  const cropHash = (node) =>
    canvas.evaluate((c, n) => {
      const out = document.createElement("canvas");
      out.width = Math.ceil(n.width);
      out.height = Math.ceil(n.height);
      out
        .getContext("2d")
        .drawImage(c, n.x, n.y, n.width, n.height, 0, 0, out.width, out.height);
      return out.toDataURL();
    }, node);
  const avatar = t.nodes.find((n) => n.role === "rewardAvatar");
  const icon = t.nodes.find((n) => n.role === "rewardIcon");
  const avatarHashes = new Set();
  for (const choice of t.options.find((o) => o.id === "reward-avatar")
    .choices) {
    const rev = await canvas.getAttribute("data-revision");
    await controls
      .getByRole("combobox", { name: "中心头像预设", exact: true })
      .selectOption(choice.id);
    await expect.poll(() => canvas.getAttribute("data-revision")).not.toBe(rev);
    avatarHashes.add(await cropHash(avatar));
  }
  assert.equal(avatarHashes.size, 5, "all five PSD avatars render distinctly");
  const iconHashes = new Set();
  for (const choice of t.options.find((o) => o.id === "reward-icon").choices) {
    const rev = await canvas.getAttribute("data-revision");
    await controls
      .getByRole("combobox", { name: "右下角图标", exact: true })
      .selectOption(choice.id);
    await expect.poll(() => canvas.getAttribute("data-revision")).not.toBe(rev);
    iconHashes.add(
      await cropHash({ ...icon, x: icon.x - 5, width: icon.width + 10 }),
    );
  }
  assert.equal(iconHashes.size, 3, "all three PSD icons render distinctly");
  const upload = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 200;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#e56a20";
    ctx.fillRect(0, 0, 200, 200);
    return c.toDataURL().split(",")[1];
  });
  await controls
    .locator("input[type=file]")
    .last()
    .setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: Buffer.from(upload, "base64"),
    });
  await page.getByRole("button", { name: "确认取景", exact: true }).click();
  await expect(controls.getByAltText("当前赞赏码中心头像")).toBeVisible();
  await expect
    .poll(() =>
      canvas.evaluate(
        (c, n) =>
          Array.from(
            c
              .getContext("2d")
              .getImageData(n.x + n.width / 2, n.y + n.height / 2, 1, 1).data,
          ),
        avatar,
      ),
    )
    .toEqual([229, 106, 32, 255]);
  await controls
    .getByRole("combobox", { name: "中心头像预设", exact: true })
    .selectOption("7-2-2");
  await expect(controls.getByAltText("当前赞赏码中心头像")).toHaveCount(0);
  const reward = t.nodes.find((n) => n.role === "reward");
  const area = {
    x: reward.x - 30,
    y: reward.y - 30,
    width: reward.width + 60,
    height: reward.height + 60,
  };
  const assertCleanBadge = async () => {
    const orange = await canvas.evaluate((c, n) => {
      const d = c
        .getContext("2d")
        .getImageData(n.x, n.y, n.width, n.height).data;
      let count = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i] > 150 && d[i] > d[i + 1] * 1.15 && d[i + 1] > d[i + 2] * 1.5)
          count++;
      return count;
    }, area);
    assert.equal(orange, 0, "the original orange badge is completely covered");
  };
  await assertCleanBadge();
  writeFileSync(
    ".local/qa/reward-restored.png",
    Buffer.from((await cropHash(area)).split(",")[1], "base64"),
  );
  await controls.screenshot({ path: ".local/qa/reward-user-controls.png" });
  // A complete screenshot also crops automatically, without exposing resize controls.
  const screenshot = await page.evaluate(async () => {
    const im = new Image();
    im.src = "/private-assets/layer-7-1.png";
    await im.decode();
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 900;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 600, 900);
    ctx.fillStyle = "#333";
    ctx.font = "24px sans-serif";
    ctx.fillText("TEST REWARD", 200, 110);
    ctx.drawImage(im, 135, 280);
    ctx.fillText("TEST ONLY", 230, 750);
    return c.toDataURL().split(",")[1];
  });
  const screenshotRev = await canvas.getAttribute("data-revision");
  await controls
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "reward-screenshot.png",
      mimeType: "image/png",
      buffer: Buffer.from(screenshot, "base64"),
    });
  await expect
    .poll(() => canvas.getAttribute("data-revision"))
    .not.toBe(screenshotRev);
  await page.getByText("已自动裁剪 · 模板尺寸", { exact: true }).waitFor();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await assertCleanBadge();
  writeFileSync(
    ".local/qa/reward-screenshot-cropped.png",
    Buffer.from((await cropHash(area)).split(",")[1], "base64"),
  );
  const admin = await context.newPage();
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.goto("http://localhost:8982/admin");
  await admin
    .getByLabel("管理员密码")
    .fill(
      readFileSync(".local/admin-access.txt", "utf8").match(
        /^Password: (.+)$/m,
      )[1],
    );
  await admin.getByRole("button", { name: "进入工作台", exact: true }).click();
  await admin.getByRole("button", { name: "保存草稿", exact: true }).waitFor();
  const before = await admin.request
    .get("http://localhost:8982/api/admin")
    .then((r) => r.json());
  await admin.getByRole("button", { name: "图层与权限", exact: true }).click();
  const select = async (folder, id) => {
    await admin
      .getByRole("button", { name: "PSD 根目录", exact: true })
      .click();
    await admin
      .locator(".psd-folders")
      .getByRole("button", { name: folder, exact: true })
      .click();
    await admin
      .locator(".layer-list button")
      .filter({
        has: admin
          .locator(".layer-number")
          .filter({ hasText: new RegExp(`^${id}$`) }),
      })
      .click();
  };
  for (const [folder, id] of [
    ["微信", "5-1"],
    ["支付宝", "6-1"],
    ["赞赏码", "7-1"],
  ]) {
    await select(folder, id);
    const width = admin.getByRole("spinbutton", {
      name: "收款码宽度（px）",
      exact: true,
    });
    const height = admin.getByRole("spinbutton", {
      name: "收款码高度（px）",
      exact: true,
    });
    const initialW = Number(await width.inputValue()),
      initialH = Number(await height.inputValue());
    const handle = admin.getByRole("button", {
      name: "调整收款码大小（右下）",
      exact: true,
    });
    await handle.scrollIntoViewIfNeeded();
    const b = await handle.boundingBox();
    await admin.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await admin.mouse.down();
    await admin.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2 + 20, {
      steps: 8,
    });
    await admin.mouse.up();
    const nextW = Number(await width.inputValue()),
      nextH = Number(await height.inputValue());
    assert.ok(nextW > initialW + 50, `${folder} has working mouse resize`);
    assert.ok(Math.abs(nextW / nextH - initialW / initialH) < 0.000001);
    await admin
      .getByRole("button", { name: "恢复已保存大小", exact: true })
      .click();
    await expect(width).toHaveValue(String(initialW));
  }
  await admin.getByLabel("同时缩放外框", { exact: true }).check();
  await admin
    .getByRole("spinbutton", { name: "收款码宽度（px）", exact: true })
    .fill("429");
  await admin
    .getByRole("img", { name: "图层位置实时预览" })
    .scrollIntoViewIfNeeded();
  await admin
    .locator(".layer-position")
    .screenshot({ path: ".local/qa/admin-code-resize.png" });
  let resizedTemplate;
  await admin.route("**/api/admin", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      assert.equal(body.action, "save");
      resizedTemplate = body.template;
      await route.fulfill({ json: { ok: true } });
    } else await route.continue();
  });
  await admin.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect.poll(() => !!resizedTemplate).toBe(true);
  assert.equal(resizedTemplate.nodes.find((n) => n.id === "7-1").width, 429);
  assert.ok(
    Math.abs(resizedTemplate.nodes.find((n) => n.id === "7-0").width - 482.3) <
      0.001,
  );
  assert.ok(resizedTemplate.nodes.every((n) => !n.sizeEditable));
  // Preview and export consume the saved dimensions after the user uploads their own codes.
  const output = await context.newPage();
  output.on("pageerror", (e) => errors.push(e.message));
  await output.route("**/api/templates", (route) =>
    route.fulfill({ json: [resizedTemplate] }),
  );
  await output.goto("http://localhost:8982");
  await expect(
    output.getByRole("img", { name: "收款卡实时预览", exact: true }),
  ).toHaveAttribute("data-revision", /\d+/);
  for (let i = 0; i < 2; i++) {
    const svg = encodeQR(
      i === 0
        ? "wxp://linkora-test-only"
        : "https://qr.alipay.com/linkora-test-only",
      "svg",
      { scale: 12, border: 4, ecc: "high" },
    );
    const png = await output.evaluate(async (svg) => {
      const im = new Image();
      im.src = "data:image/svg+xml," + encodeURIComponent(svg);
      await im.decode();
      const c = document.createElement("canvas");
      c.width = 1000;
      c.height = 1500;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(im, 200, 400, 600, 600);
      return c.toDataURL().split(",")[1];
    }, svg);
    await output
      .locator(".code-upload")
      .nth(i)
      .locator("input[type=file]")
      .setInputFiles({
        name: `code-${i}.png`,
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      });
    await output
      .locator(".code-upload")
      .nth(i)
      .getByText("已识别 · 内容已提取")
      .waitFor();
  }
  await output
    .locator(".code-upload")
    .nth(2)
    .locator("input[type=file]")
    .setInputFiles("public/private-assets/layer-7-1.png");
  await output.getByText("已自动裁剪 · 模板尺寸", { exact: true }).waitFor();
  const button = output.getByRole("button", {
    name: "下载高清 PNG",
    exact: true,
  });
  await expect(button).toBeEnabled();
  const pending = output.waitForEvent("download");
  await button.click();
  const download = await pending;
  await download.saveAs(".local/qa/reward-resized-export.png");
  const exported = readFileSync(".local/qa/reward-resized-export.png");
  assert.equal(exported.readUInt32BE(16), resizedTemplate.width * 2);
  assert.equal(exported.readUInt32BE(20), resizedTemplate.height * 2);
  await output.screenshot({ path: ".local/qa/reward-resized-studio.png" });
  await output.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await output.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const after = await admin.request
    .get("http://localhost:8982/api/admin")
    .then((r) => r.json());
  assert.deepEqual(
    after.templates,
    before.templates,
    "test resizing never overwrites saved templates",
  );
  assert.deepEqual(errors, []);
  await admin.request.delete("http://localhost:8982/api/auth", {
    headers: { Origin: "http://localhost:8982" },
  });
  console.log(
    "Reward QA passed: 5 distinct avatars, 3 distinct icons, uploaded avatar replaces preset, automatic crop without user resize, all 3 codes mouse-resize in admin, linked overlays/frame, saved dimensions feed user-upload preview and PNG export, mobile.",
  );
} catch (error) {
  const pages = browser.contexts().flatMap((c) => c.pages());
  const last = pages.at(-1);
  if (last) {
    await last.screenshot({ path: ".local/qa/reward-failure.png" });
    console.log(await last.locator(".toast").allTextContents());
  }
  throw error;
} finally {
  await browser.close();
}
