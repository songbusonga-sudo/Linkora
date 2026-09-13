import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import encodeQR from '@paulmillr/qr';
mkdirSync('.local/qa', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const created = [];
const codeFixtures = [];
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
  page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8982/admin');
  await page.getByLabel('管理员密码').fill(readFileSync('.local/admin-access.txt', 'utf8').match(/^Password: (.+)$/m)[1]);
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await page.getByRole('button', { name: '保存草稿', exact: true }).waitFor();
  const before = await page.request.get('http://localhost:8982/api/admin').then(r => r.json());
  const state = structuredClone(before), row = state.templates[0];
  await page.route('**/api/admin', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: state });
    const body = route.request().postDataJSON(); assert.equal(body.action, 'save');
    row.draft = body.template; row.revision++;
    state.assets = [...state.assets, ...row.draft.assets.filter(a => !state.assets.some(b => a.id === b.id)).map(a => ({ ...a, distributable: +a.distributable }))];
    await route.fulfill({ json: { ok: true } });
  });
  page.on('response', async response => {
    if (response.url().endsWith('/api/assets') && response.request().method() === 'POST' && response.ok()) created.push((await response.json()).id);
  });
  const png = async color => Buffer.from(await page.evaluate(color => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 400;
    const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 600, 400);
    return c.toDataURL().split(',')[1];
  }, color), 'base64');
  const red = { name: 'qa-default-avatar.png', mimeType: 'image/png', buffer: await png('#ee5522') };
  const blue = { name: 'qa-background.png', mimeType: 'image/png', buffer: await png('#2266bb') };
  await page.getByRole('button', { name: '图层与权限', exact: true }).click();
  for (const [category, file] of [['background', blue], ['avatar', red]]) {
    await page.getByRole('button', { name: '新增素材', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新增用户可选素材' });
    await dialog.getByLabel('素材用途').selectOption(category);
    await dialog.locator('input[type=file]').setInputFiles(file);
    await expect(dialog).toHaveCount(0);
  }
  await page.getByRole('button', { name: '更改默认展示', exact: true }).click();
  const canvas = page.getByRole('img', { name: '收款卡实时预览', exact: true });
  await expect(canvas).toHaveAttribute('data-revision', /\d+/);
  await page.locator('.studio-options summary').click();
  await page.getByRole('textbox', { name: '署名', exact: true }).fill('默认展示测试');
  await page.locator('.upload-label').filter({ hasText: /^上传头像$/ }).locator('input').setInputFiles(red);
  await page.getByRole('button', { name: '确认取景', exact: true }).click();
  await page.locator('.background-picker button[title="1"]').click();
  for (const [i, name, payload] of [[0, '微信收款码', 'wxp://qa-default'], [1, '支付宝收款码', 'https://qr.alipay.com/qa-default']]) {
    await page.getByRole('button', { name: `${name}：更改码样式`, exact: true }).click();
    const region = page.getByRole('region', { name: `${name}编辑`, exact: true });
    const svg = encodeQR(payload, 'svg', { scale: 12, border: 4, ecc: 'high' });
    const code = Buffer.from(await page.evaluate(async svg => {
      const im = new Image(); im.src = 'data:image/svg+xml,' + encodeURIComponent(svg); await im.decode();
      const c = document.createElement('canvas'); c.width = 1000; c.height = 1500;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1000, 1500); ctx.drawImage(im, 200, 400, 600, 600);
      return c.toDataURL().split(',')[1];
    }, svg), 'base64');
    codeFixtures.push({ name: `qa-default-code-${i}.png`, mimeType: 'image/png', buffer: code });
    await region.locator('input[type=file]').first().setInputFiles(codeFixtures[i]);
    await page.locator('.code-upload').nth(i).getByText('已识别 · 内容已提取').waitFor();
    await expect(region.getByText('二维码中心头像', { exact: true })).toHaveCount(0);
    await expect(region.getByText('上传二维码中心头像', { exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: '微信赞赏码：更改图层与头像', exact: true }).click();
  const reward = page.getByRole('region', { name: '微信赞赏码编辑', exact: true });
  await reward.locator('input[type=file]').first().setInputFiles('public/private-assets/layer-7-1.png');
  await page.getByText('已自动裁剪 · 模板尺寸', { exact: true }).waitFor();
  await reward.locator('input[type=file]').last().setInputFiles(red);
  const squareDialog = page.getByRole('dialog', { name: '裁切赞赏码正方形头像', exact: true });
  await expect(squareDialog.locator('.avatar-crop-source')).toHaveClass(/is-square/);
  assert.equal(await squareDialog.locator('.avatar-crop-move').evaluate(el => getComputedStyle(el).borderRadius), '0px');
  await page.screenshot({ path: '.local/qa/reward-square-crop.png' });
  await page.getByRole('button', { name: '确认取景', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-revision', /\d+/);
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText('草稿已保存', { exact: true })).toBeVisible();
  const saved = row.draft;
  assert.equal(JSON.stringify(saved.defaults).includes('data:image/'), false);
  assert.equal(saved.defaults.codes.wechat.content, 'wxp://qa-default');
  assert.equal(saved.defaults.codes.alipay.content, 'https://qr.alipay.com/qa-default');
  assert.equal(saved.defaults.edits.texts['10-0'], '默认展示测试');
  assert.deepEqual(saved.nodes.map(n => [n.id, n.x, n.y, n.width, n.height]), before.templates[0].draft.nodes.map(n => [n.id, n.x, n.y, n.width, n.height]));
  await page.reload(); await page.getByRole('button', { name: '更改默认展示', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-revision', /\d+/);
  const pixel = (surface, node) => surface.evaluate((c, n) => Array.from(c.getContext('2d').getImageData(n.x + n.width / 2, n.y + n.height / 2, 1, 1).data), node);
  for (const role of ['avatar', 'rewardAvatar']) await expect.poll(() => pixel(canvas, saved.nodes.find(n => n.role === role))).toEqual([238, 85, 34, 255]);
  const squarePixels = (surface, template) => surface.evaluate((c, n) => {
    const ctx = c.getContext('2d');
    return [[3,3],[n.width-4,3],[3,n.height-4],[n.width-4,n.height-4]].map(([x,y]) => Array.from(ctx.getImageData(n.x+x,n.y+y,1,1).data));
  }, template.nodes.find(n => n.role === 'rewardAvatar'));
  await expect.poll(() => squarePixels(canvas, saved)).toEqual(Array(4).fill([238,85,34,255]));
  await page.screenshot({ path: '.local/qa/default-display-admin.png' });
  const studio = await context.newPage(); studio.on('pageerror', e => errors.push(e.message));
  await studio.route('**/api/templates', route => route.fulfill({ json: [saved] }));
  await studio.goto('http://localhost:8982');
  const preview = studio.getByRole('img', { name: '收款卡实时预览', exact: true });
  await expect(preview).toHaveAttribute('data-revision', /\d+/);
  for (const role of ['avatar', 'rewardAvatar']) await expect.poll(() => pixel(preview, saved.nodes.find(n => n.role === role))).toEqual([238, 85, 34, 255]);
  await expect.poll(() => squarePixels(preview, saved)).toEqual(Array(4).fill([238,85,34,255]));
  await expect(studio.getByRole('button', { name: '下载高清 PNG', exact: true })).toBeEnabled();
  await expect(studio.locator('.count-badge')).toHaveText('0 / 3');
  await studio.locator('.studio-options summary').click();
  await expect(studio.locator('.background-picker button[title="1"]')).toBeVisible();
  await expect(studio.locator('.upload-label').filter({ hasText: /^上传头像$/ }).locator('input')).toHaveCount(1);
  await studio.screenshot({ path: '.local/qa/default-display-public.png' });
  await studio.locator('.upload-label').filter({ hasText: /^上传头像$/ }).locator('input').setInputFiles(blue);
  await studio.getByRole('button', { name: '确认取景', exact: true }).click();
  await expect.poll(() => pixel(preview, saved.nodes.find(n => n.role === 'avatar'))).toEqual([34, 102, 187, 255]);
  for (let i = 0; i < 2; i++) {
    await studio.locator('.code-upload').nth(i).locator('input[type=file]').setInputFiles(codeFixtures[i]);
    await studio.locator('.code-upload').nth(i).getByText('已识别 · 内容已提取').waitFor();
    await studio.locator('.code-upload').nth(i).getByRole('button', { name: /更改码样式/ }).click();
    await expect(studio.locator('.code-upload').nth(i).getByText('二维码中心头像', { exact: true })).toHaveCount(0);
    await expect(studio.locator('.code-upload').nth(i).getByText('上传二维码中心头像', { exact: true })).toHaveCount(0);
  }
  await studio.locator('.code-upload').nth(2).locator('input[type=file]').setInputFiles('public/private-assets/layer-7-1.png');
  await studio.getByText('已自动裁剪 · 模板尺寸', { exact: true }).waitFor();
  const downloadButton = studio.getByRole('button', { name: '下载高清 PNG', exact: true });
  await expect(downloadButton).toBeEnabled();
  const pending = studio.waitForEvent('download'); await downloadButton.click();
  await (await pending).saveAs('.local/qa/default-display-export.png');
  const exported = readFileSync('.local/qa/default-display-export.png');
  assert.equal(exported.readUInt32BE(16), saved.width * 2);
  assert.equal(exported.readUInt32BE(20), saved.height * 2);
  const exportedCorners = await studio.evaluate(async ({ png, node }) => {
    const im = new Image(); im.src = `data:image/png;base64,${png}`; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
    return [[3,3],[node.width-4,3],[3,node.height-4],[node.width-4,node.height-4]].map(([x,y]) =>
      Array.from(ctx.getImageData((node.x+x)*2,(node.y+y)*2,1,1).data));
  }, { png: exported.toString('base64'), node: saved.nodes.find(n => n.role === 'rewardAvatar') });
  assert.deepEqual(exportedCorners, Array(4).fill([238,85,34,255]), 'export retains all four square avatar corners');
  await studio.setViewportSize({ width: 390, height: 844 });
  assert.equal(await studio.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const after = await page.request.get('http://localhost:8982/api/admin').then(r => r.json());
  assert.deepEqual(after.templates, before.templates);
  assert.deepEqual(errors, []);
  console.log('Default display QA passed: shared editor, all 3 default codes, main avatar and square reward avatar, no regular-code avatar controls, backgrounds, library presets, persisted asset refs, save/reload and public preview, optional user uploads, mobile.');
} catch (e) { if (page) { await page.screenshot({ path: '.local/qa/default-display-failure.png' }); console.log(await page.locator('.toast').allTextContents()); } throw e; }
finally {
  if (page) for (const id of created) {
    const response = await page.request.delete('http://localhost:8982/api/assets', { data: { id }, headers: { Origin: 'http://localhost:8982' } });
    assert.ok(response.ok(), 'remove only the unreferenced QA asset');
  }
  await browser.close();
}
