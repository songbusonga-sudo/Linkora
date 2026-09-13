import { chromium, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";

const db = new DatabaseSync("data/linkora.sqlite", { readOnly: true });
const templates = db
  .prepare("SELECT * FROM templates")
  .all()
  .map((row) => ({ ...row, draft: JSON.parse(row.draft) }));
db.close();
templates[0].draft.nodes.find((node) => node.role === "reward").colorEditable =
  true;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
    hasTouch: true,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.EyeDropper = class {
      async open() {
        return { sRGBHex: "#adc5d9" };
      }
    };
  });
  await page.route("**/api/auth", (route) =>
    route.fulfill({ json: { authenticated: true, configured: true } }),
  );
  await page.route("**/api/admin", (route) => {
    assert.equal(
      route.request().method(),
      "GET",
      "UI checks must not save the user's template",
    );
    return route.fulfill({
      json: { templates, assets: [], versions: [], layers: [] },
    });
  });
  await page.goto("http://localhost:8982/admin");
  await page.getByRole("button", { name: "更改默认展示", exact: true }).click();
  const label = "赞赏码主体颜色";
  const trigger = page.getByRole("button", { name: label, exact: true });
  const picker = page.getByRole("dialog", {
    name: `${label}选色面板`,
    exact: true,
  });
  const field = page.locator(".color-field").filter({ has: trigger });
  const red = field.getByRole("spinbutton", {
    name: `${label} R`,
    exact: true,
  });
  const green = field.getByRole("spinbutton", {
    name: `${label} G`,
    exact: true,
  });
  const blue = field.getByRole("spinbutton", {
    name: `${label} B`,
    exact: true,
  });
  await trigger.click();
  await expect(picker).toBeVisible();
  await expect(page.locator('input[type="color"]')).toHaveCount(0);
  await picker.getByRole("button", { name: "蜜桃粉", exact: true }).click();
  await expect(red).toHaveValue("237");
  await expect(green).toHaveValue("182");
  await expect(blue).toHaveValue("190");
  const hex = picker.getByRole("textbox", {
    name: `${label} HEX`,
    exact: true,
  });
  await hex.fill("#ff0000");
  await expect(red).toHaveValue("255");
  await expect(green).toHaveValue("0");
  await picker.getByRole("slider").press("Home");
  await picker.getByRole("slider").press("ArrowRight");
  await expect(green).toHaveValue("4");
  const plane = picker.locator(".soft-color-plane");
  const planeBounds = await plane.boundingBox();
  await plane.click({
    position: { x: planeBounds.width / 2, y: planeBounds.height / 2 },
  });
  await expect(red).toHaveValue("128");
  await page.mouse.move(planeBounds.x + 20, planeBounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(
    planeBounds.x + planeBounds.width + 10,
    planeBounds.y + planeBounds.height + 10,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect(red).toHaveValue("0");
  await expect(blue).toHaveValue("0");
  await plane.focus();
  await plane.press("ArrowUp");
  await expect(red).toHaveValue("3");
  await picker.getByRole("button", { name: "屏幕吸色" }).click();
  await expect(hex).toHaveValue("#ADC5D9");
  await hex.fill("invalid");
  await hex.press("Tab");
  await expect(hex).toHaveValue("#ADC5D9");
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();
  await red.fill("160");
  await green.fill("160");
  await blue.fill("160");
  await trigger.click();
  await expect(hex).toHaveValue("#A0A0A0");
  await picker.getByRole("button", { name: "香芋紫", exact: true }).click();
  mkdirSync(".local/qa", { recursive: true });
  await page.screenshot({ path: ".local/qa/color-picker-desktop.png" });
  await picker.screenshot({ path: ".local/qa/color-picker-detail.png" });
  await page
    .getByRole("heading", { name: "更改默认展示", exact: true })
    .click();
  await expect(picker).not.toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.tap();
  await expect(picker).toBeVisible();
  const bounds = await picker.boundingBox();
  assert.ok(
    bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= 390 &&
      bounds.y + bounds.height <= 844,
  );
  await picker.getByRole("button", { name: "蜜桃粉", exact: true }).tap();
  await expect(red).toHaveValue("237");
  await page.screenshot({ path: ".local/qa/color-picker-mobile.png" });
  await picker.getByRole("button", { name: "关闭选色面板" }).tap();
  await expect(picker).not.toBeVisible();
  await expect(trigger).toBeFocused();
  assert.deepEqual(errors, []);
  console.log(
    "Custom picker passed: presets, HEX/RGB sync, hue, pointer drag, keyboard, eyedropper, outside/Escape close and mobile touch.",
  );
} finally {
  await browser.close();
}
