import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

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
  await page.locator(".studio-options > summary").click();
  const fixture = async (w, h) =>
    Buffer.from(
      await page.evaluate(
        ([w, h]) => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d");
          const gradient = ctx.createLinearGradient(0, 0, w, h);
          gradient.addColorStop(0, "#f5c49b");
          gradient.addColorStop(1, "#526e94");
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, Math.min(w, h) / 5, 0, Math.PI * 2);
          ctx.fill();
          return c.toDataURL().split(",")[1];
        },
        [w, h],
      ),
      "base64",
    );
  const selection = page.locator(".avatar-crop-selection");
  await page
    .locator(".code-upload")
    .nth(2)
    .locator("input[type=file]")
    .setInputFiles({
      name: "reward.png",
      mimeType: "image/png",
      buffer: await fixture(600, 600),
    });
  await expect(page.getByRole("dialog").getByRole("slider")).toHaveCount(3);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  const move = page.getByRole("button", { name: "移动头像选区" });
  const drag = async (locator, dx, dy) => {
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + dx,
      box.y + box.height / 2 + dy,
      { steps: 8 },
    );
    await page.mouse.up();
  };
  for (const [w, h] of [
    [900, 600],
    [600, 900],
    [600, 600],
  ]) {
    await page.locator(".avatar-edit input[type=file]").setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: await fixture(w, h),
    });
    await move.waitFor();
    await expect(page.getByRole("dialog").getByRole("slider")).toHaveCount(0);
    const initial = await selection.boundingBox();
    assert.ok(
      Math.abs(initial.width - initial.height) < 1,
      "selection is circular for every aspect ratio",
    );
    const preview = await page
      .locator(".round-preview")
      .evaluate((c) => c.toDataURL());
    await drag(
      page.getByRole("button", {
        name: "调整头像选区大小（右下）",
        exact: true,
      }),
      -25,
      -25,
    );
    const shrunk = await selection.boundingBox();
    assert.ok(
      shrunk.width < initial.width - 40,
      "drag handle shrinks the circle",
    );
    assert.ok(
      Math.abs(shrunk.x + shrunk.width / 2 - initial.x - initial.width / 2) < 1,
      "resize preserves center",
    );
    await expect
      .poll(() => page.locator(".round-preview").evaluate((c) => c.toDataURL()))
      .not.toBe(preview);
    await drag(move, 20, 15);
    const moved = await selection.boundingBox();
    assert.ok(
      Math.abs(moved.x - shrunk.x - 20) < 1 &&
        Math.abs(moved.y - shrunk.y - 15) < 1,
      "mouse moves selection directly",
    );
    await drag(move, -1000, -1000);
    const edge = await selection.boundingBox();
    const source = await page.locator(".avatar-crop-source").boundingBox();
    assert.ok(
      Math.abs(edge.x - source.x) < 1 && Math.abs(edge.y - source.y) < 1,
      "selection stays inside image even outside pointer capture area",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "恢复默认", exact: true })
      .click();
    const reset = await selection.boundingBox();
    assert.ok(
      Math.abs(reset.width - initial.width) < 1 &&
        Math.abs(reset.x - initial.x) < 1,
    );
    await move.press("-");
    assert.ok(
      (await selection.boundingBox()).width < initial.width,
      "keyboard resizing works",
    );
    await page.screenshot({ path: `.local/qa/avatar-${w}-${h}.png` });
    await page.getByRole("button", { name: "确认取景" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByAltText("主头像", { exact: true })).toHaveAttribute(
      "src",
      /^data:image\/png/,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".avatar-edit input[type=file]").setInputFiles({
    name: "mobile.png",
    mimeType: "image/png",
    buffer: await fixture(600, 900),
  });
  await move.waitFor();
  await page.screenshot({ path: ".local/qa/avatar-mobile.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const before = await selection.boundingBox();
  await drag(
    page.getByRole("button", { name: "调整头像选区大小（右下）", exact: true }),
    -20,
    -20,
  );
  assert.ok((await selection.boundingBox()).width < before.width);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "Avatar crop QA passed: circle geometry, resize, move, bounds, preview, reset, keyboard, confirmation, mobile and reward sliders.",
  );
} finally {
  await browser.close();
}
