import { chromium, expect } from '@playwright/test';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';

mkdirSync('.local/qa', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:8982/admin');
  await page.getByLabel('管理员密码').fill(readFileSync('.local/admin-access.txt', 'utf8').match(/^Password: (.+)$/m)[1]);
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await page.getByRole('button', { name: '保存草稿', exact: true }).waitFor();
  const before = await page.request.get('http://localhost:8982/api/admin').then(r => r.json());
  const state = structuredClone(before), row = state.templates[0];
  const id = row.draft.nodes.find(n => n.role === 'reward').id;
  assert.equal(row.draft.nodes.find(n => n.id === id).colorEditable, true);
  await page.route('**/api/admin', async route => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      assert.equal(payload.action, 'save');
      row.draft = payload.template; row.revision++;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: state });
  });
  await page.getByRole('button', { name: '更改默认展示', exact: true }).click();
  const canvas = page.getByRole('img', { name: '收款卡实时预览', exact: true });
  await expect(canvas).toHaveAttribute('data-revision', /\d+/);
  await page.getByRole('button', { name: '微信赞赏码：更改图层与头像', exact: true }).click();
  const colorTrigger = page.getByRole('button', { name: '赞赏码主体颜色', exact: true });
  const color = page.getByRole('textbox', { name: '赞赏码主体颜色 HEX', exact: true });
  const previousRevision = await canvas.getAttribute('data-revision');
  await colorTrigger.click();
  await color.fill('#285ca3');
  await expect(color).toHaveValue('#285CA3');
  await page.getByRole('button', { name: '关闭选色面板' }).click();
  await expect.poll(() => canvas.getAttribute('data-revision')).not.toBe(previousRevision);
  await expect(page.locator('.render-indicator')).toHaveCount(0);
  await page.screenshot({ path: '.local/qa/reward-color-admin.png' });
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText('草稿已保存', { exact: true })).toBeVisible();
  assert.equal(row.draft.defaults.edits.colors[id], '#285ca3');
  await page.reload();
  await page.getByRole('button', { name: '更改默认展示', exact: true }).click();
  await page.getByRole('button', { name: '微信赞赏码：更改图层与头像', exact: true }).click();
  await colorTrigger.click();
  await expect(color).toHaveValue('#285CA3');
  await page.getByRole('button', { name: '关闭选色面板' }).click();

  const bundle = await build({ stdin: { contents: 'export { drawTemplate } from "./src/lib/render"; export { emptyEdits } from "./src/lib/model"; export { presetStyle } from "./src/lib/qr";', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'rewardColorQA', platform: 'browser' });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const checks = await page.evaluate(async t => {
    const { drawTemplate, emptyEdits, presetStyle } = rewardColorQA;
    delete t.defaults; t.options = [];
    const body = t.nodes.find(n => n.role === 'reward');
    const frame = t.nodes.find(n => n.id === '7-0');
    const raster = document.createElement('canvas'); raster.width = raster.height = 100;
    const ctx = raster.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 100, 100); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 50, 100);
    const src = raster.toDataURL();
    const solid = color => { ctx.fillStyle = color; ctx.fillRect(0, 0, 100, 100); return raster.toDataURL(); };
    const avatar = { ...body, id: '7-2-1', role: 'rewardAvatar', colorEditable: false, contentEditable: true, src: solid('#e34477'), x: body.x + body.width * .4, y: body.y + body.height * .4, width: body.width * .2, height: body.height * .2 };
    const icon = { ...avatar, id: '7-4-0', role: 'rewardIcon', contentEditable: false, src: solid('#15965c'), x: body.x + body.width * .65, y: body.y + body.height * .65, width: body.width * .12, height: body.height * .12 };
    t.nodes = [frame, { ...body, src }, avatar, icon];
    const edits = emptyEdits(); edits.colors[body.id] = '#285ca3';
    const samples = [];
    for (const uploaded of [false, true]) for (const scale of [1000 / t.width, 2]) {
      const codes = uploaded ? { reward: { image: src, crop: { x: 0, y: 0, size: 100 }, confirmed: true } } : {};
      const c = await drawTemplate(t, edits, codes, { wechat: presetStyle(), alipay: presetStyle() }, scale);
      const pixel = (x, y) => Array.from(c.getContext('2d').getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data);
      samples.push({ uploaded, scale,
        ink: pixel(body.x + body.width * .3, body.y + body.height * .3),
        white: pixel(body.x + body.width * .7, body.y + body.height * .3),
        avatar: pixel(avatar.x + avatar.width / 2, avatar.y + avatar.height / 2),
        icon: pixel(icon.x + icon.width / 2, icon.y + icon.height / 2) });
    }
    return samples;
  }, structuredClone(row.draft));
  for (const sample of checks) {
    assert.deepEqual(sample.ink, [40, 92, 163, 255]);
    assert.deepEqual(sample.white, [255, 255, 255, 255]);
    assert.deepEqual(sample.avatar, [227, 68, 119, 255]);
    assert.deepEqual(sample.icon, [21, 150, 92, 255]);
  }
  // Isolate the reward-color export from existing WeChat/Alipay styles whose
  // independent decode checks may fail at very light user-selected settings.
  row.draft.defaults.styles = await page.evaluate(() => ({ wechat: rewardColorQA.presetStyle(), alipay: rewardColorQA.presetStyle() }));
  await page.route('**/api/templates', route => route.fulfill({ json: [row.draft] }));
  await page.goto('http://localhost:8982');
  await page.locator('.studio-options summary').click();
  await colorTrigger.click();
  await expect(color).toHaveValue('#285CA3');
  await color.fill('#854591');
  await page.getByRole('button', { name: '关闭选色面板' }).click();
  await expect(page.locator('.render-indicator')).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载高清 PNG', exact: true }).click();
  const download = await downloadPromise.catch(async error => {
    console.error(await page.locator('[role="alert"]').allTextContents());
    await page.screenshot({ path: '.local/qa/reward-color-download-error.png' });
    throw error;
  });
  await download.saveAs('.local/qa/reward-color-export.png');
  assert.equal(await download.failure(), null);
  await page.screenshot({ path: '.local/qa/reward-color-public.png' });
  assert.deepEqual(errors, []);
  await page.unroute('**/api/admin');
  const after = await page.request.get('http://localhost:8982/api/admin').then(r => r.json());
  assert.deepEqual(after.templates, before.templates);
  console.log('Reward color QA passed: admin save/reload (mocked), public picker/download, source and upload tint at preview/export scale, white backing and top overlays preserved; saved templates unchanged.');
} finally { await browser.close(); }
