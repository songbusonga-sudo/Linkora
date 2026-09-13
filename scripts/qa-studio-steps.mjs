import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";

mkdirSync(".local/qa", { recursive: true });
const base = process.env.QA_BASE_URL ?? "http://127.0.0.1:8982";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const errors = [];
const next = (page) =>
  page.getByRole("button", { name: "下一步", exact: true }).click();
const previous = (page) =>
  page.getByRole("button", { name: "上一步", exact: true }).click();
const expectStep = async (page, step) => {
  await expect(page.locator(".studio")).toHaveAttribute(
    "data-step",
    String(step),
  );
  await expect(page.locator(".studio-page:visible")).toHaveCount(1);
  await expect(
    page.locator(
      ".studio-step-progress button[aria-current=step] > span",
    ),
  ).toHaveText(String(step));
  await expect(
    page.getByRole("button", { name: "上一步", exact: true }),
  ).toHaveCount(step > 1 ? 1 : 0);
  await expect(
    page.getByRole("button", { name: "下一步", exact: true }),
  ).toHaveCount(step < 3 ? 1 : 0);
};
const openColors = async (page, name) => {
  const card = page.getByRole("region", { name: name + "设置", exact: true });
  await card.locator(".code-color-controls > summary").click();
  return card;
};
const waitPreview = async (page) => {
  await page
    .locator(".preview-placeholder")
    .waitFor({ state: "hidden", timeout: 60000 });
  await expect(page.locator(".render-indicator")).toHaveCount(0, {
    timeout: 30000,
  });
};

try {
  const template = (
    await context.request.get(base + "/api/templates").then((r) => r.json())
  )[0];
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await waitPreview(page);
  await expectStep(page, 1);
  await expect(page.getByAltText("主头像", { exact: true })).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "署名", exact: true }),
  ).toBeHidden();
  await expect(
    page.locator(".studio-step-progress button"),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "头像与背景", exact: true }).click();
  await expectStep(page, 2);
  await expect(
    page.getByRole("region", { name: "头像与背景", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "署名与文字", exact: true }).click();
  await expectStep(page, 3);
  await expect(
    page.getByRole("region", { name: "署名与提示文字", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "收款码", exact: true }).click();
  await expectStep(page, 1);
  const card = await openColors(page, "微信收款码");
  await card
    .getByRole("spinbutton", { name: "微信收款码信息点颜色 R", exact: true })
    .fill("32");
  await card
    .getByRole("spinbutton", { name: "微信收款码边框颜色 R", exact: true })
    .fill("51");
  const reward = await openColors(page, "微信赞赏码");
  await reward
    .getByRole("spinbutton", { name: "赞赏码主体颜色 R", exact: true })
    .fill("44");
  await waitPreview(page);
  await next(page);
  await expectStep(page, 2);
  await expect(
    page.getByRole("region", { name: "收款码上传与颜色", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "署名", exact: true }),
  ).toBeHidden();
  const buffer = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 600;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#eccbb5";
      ctx.fillRect(0, 0, 600, 600);
      ctx.fillStyle = "#506e66";
      ctx.fillRect(150, 150, 300, 300);
      return c.toDataURL().split(",")[1];
    }),
    "base64",
  );
  await page
    .locator(".avatar-edit input[type=file]")
    .first()
    .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer });
  await page.getByRole("button", { name: "确认取景", exact: true }).click();
  const avatar = await page
    .getByAltText("主头像", { exact: true })
    .getAttribute("src");
  await page.getByRole("radio", { name: "自己上传", exact: true }).check();
  await page
    .locator(".background-upload input[type=file]")
    .setInputFiles({ name: "background.png", mimeType: "image/png", buffer });
  await expect(page.getByAltText("自己上传的背景")).toBeVisible();
  await page
    .getByRole("slider", { name: "背景缩放", exact: true })
    .press("ArrowRight");
  const scale = await page
    .getByRole("slider", { name: "背景缩放", exact: true })
    .inputValue();
  await next(page);
  await expectStep(page, 3);
  const signature = page.getByRole("region", { name: "署名设置", exact: true });
  await signature
    .getByRole("textbox", { name: "署名", exact: true })
    .fill("分页验证");
  await signature
    .getByRole("spinbutton", { name: "署名颜色 R", exact: true })
    .fill("66");
  for (const node of template.nodes.filter(
    (n) => n.role === "text" && n.contentEditable,
  )) {
    const group = page.getByRole("region", {
      name: node.name + "设置",
      exact: true,
    });
    await group
      .getByRole("textbox", { name: node.name, exact: true })
      .fill(node.name + "测试");
    if (node.colorEditable)
      await group
        .getByRole("spinbutton", { name: node.name + "颜色 R", exact: true })
        .fill("77");
  }
  await previous(page);
  await expectStep(page, 2);
  await expect(page.getByAltText("主头像", { exact: true })).toHaveAttribute(
    "src",
    avatar,
  );
  await expect(
    page.getByRole("radio", { name: "自己上传", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "调整背景", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "背景缩放", exact: true }),
  ).toHaveValue(scale);
  await previous(page);
  await expectStep(page, 1);
  await expect(
    card.getByRole("spinbutton", {
      name: "微信收款码信息点颜色 R",
      exact: true,
    }),
  ).toHaveValue("32");
  await expect(
    card.getByRole("spinbutton", { name: "微信收款码边框颜色 R", exact: true }),
  ).toHaveValue("51");
  await expect(
    reward.getByRole("spinbutton", { name: "赞赏码主体颜色 R", exact: true }),
  ).toHaveValue("44");
  await next(page);
  await next(page);
  await expect(
    signature.getByRole("textbox", { name: "署名", exact: true }),
  ).toHaveValue("分页验证");
  await expect(
    signature.getByRole("spinbutton", { name: "署名颜色 R", exact: true }),
  ).toHaveValue("66");
  console.log(
    "User steps passed: associated colors, avatar/background uploads, background framing and retained edits.",
  );

  const admin = await context.newPage();
  admin.on("pageerror", (error) => errors.push(error.message));
  const row = {
    id: template.id,
    draft: structuredClone(template),
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
  await admin.goto(base + "/admin");
  await admin
    .getByRole("button", { name: "更改默认展示", exact: true })
    .click();
  await expectStep(admin, 1);
  const adminCard = await openColors(admin, "微信收款码");
  await adminCard
    .getByRole("spinbutton", { name: "微信收款码边框颜色 R", exact: true })
    .fill("51");
  await next(admin);
  await expectStep(admin, 2);
  await admin.getByRole("button", { name: "调整背景", exact: true }).click();
  await expect(
    admin.getByRole("group", { name: "背景调整工具", exact: true }),
  ).toBeVisible();
  await next(admin);
  await expectStep(admin, 3);
  await admin
    .getByRole("textbox", { name: "署名", exact: true })
    .fill("后台分页验证");
  await admin
    .getByRole("spinbutton", { name: "署名颜色 R", exact: true })
    .fill("66");
  await waitPreview(admin);
  await admin.screenshot({ path: ".local/qa/steps-admin-text.png" });
  await admin.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect.poll(() => saves).toBe(1);
  const signatureId = template.nodes.find((n) => n.role === "signature").id;
  assert.equal(row.draft.defaults.edits.texts[signatureId], "后台分页验证");
  assert.ok(row.draft.defaults.edits.colors[signatureId].startsWith("#42"));
  assert.ok(row.draft.defaults.edits.colors["5-0"].startsWith("#33"));
  await admin.reload();
  await admin
    .getByRole("button", { name: "更改默认展示", exact: true })
    .click();
  await next(admin);
  await next(admin);
  await expect(
    admin.getByRole("textbox", { name: "署名", exact: true }),
  ).toHaveValue("后台分页验证");
  await expect(
    admin.getByRole("spinbutton", { name: "署名颜色 R", exact: true }),
  ).toHaveValue("66");
  console.log(
    "Admin steps passed: shared navigation and preserved draft payload after save/reload (mock API; no real draft changed).",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
