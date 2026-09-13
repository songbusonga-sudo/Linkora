import { chromium, expect } from "@playwright/test";

const base = process.env.QA_BASE_URL ?? "http://127.0.0.1:8982";
const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(base, { waitUntil: "domcontentloaded" });

  const steps = page.getByRole("list", { name: "制作步骤" });
  await expect(steps.getByRole("button")).toHaveCount(3);

  for (const [name, region] of [
    ["头像与背景", "头像与背景"],
    ["署名与文字", "署名与提示文字"],
    ["收款码", "收款码上传与颜色"],
  ]) {
    await steps.getByRole("button", { name, exact: true }).click();
    await expect(steps.getByRole("button", { name, exact: true })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await expect(page.getByRole("region", { name: region, exact: true })).toBeVisible();
  }

  console.log("Step navigation passed: each progress item switches to its matching panel.");
} finally {
  await browser.close();
}
