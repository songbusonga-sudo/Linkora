import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import encodeQR from '@paulmillr/qr';
import { mkdirSync } from 'node:fs';

mkdirSync('.local/qa', { recursive: true });
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:8982';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const settled = async (page) => {
  await expect(page.locator('.preview-placeholder')).toHaveCount(0, { timeout: 60000 });
  await expect(page.locator('.render-indicator')).toHaveCount(0, { timeout: 60000 });
};
const preview = (page) => page.locator('.artboard > canvas').evaluate(c => c.toDataURL());
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await settled(page);
  // Real SSR props include saved codes: they must never become user uploads.
  await expect(page.locator('.code-upload.has-code')).toHaveCount(0);
  await expect(page.locator('.uploaded-row')).toHaveCount(0);
  await expect(page.locator('.code-upload .dropzone')).toHaveText(['点击上传图片', '点击上传图片', '点击上传图片']);
  const initial = await preview(page);
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  desktop.on('pageerror', e => errors.push(e.message));
  await desktop.goto(base);
  await settled(desktop);
  assert.equal(await preview(desktop), initial, 'Desktop and mobile previews must match');
  await expect(desktop.locator('.code-upload.has-code')).toHaveCount(0);
  const card = page.getByRole('region', { name: '微信收款码设置', exact: true });
  await card.locator('.code-color-controls > summary').click();
  const field = card.locator('.color-field').first();
  await field.getByRole('button', { name: '预览取色', exact: true }).click();
  const sample = field.getByRole('group', { name: '图片像素取色' });
  await expect(sample.locator('.sample-coordinates')).toBeVisible();
  assert.equal(await sample.locator('.sample-source').evaluate(c => c.toDataURL()), initial, 'Sampling must use the rendered preview at full preview resolution');
  await expect(sample.getByRole('button', { name: '像素放大镜' })).toHaveAttribute('aria-pressed', 'true');
  const originalX = Number((await sample.locator('.sample-coordinates').innerText()).match(/X (\d+)/)[1]);
  await sample.getByRole('button', { name: '向右移动一个像素' }).tap();
  await expect(sample.locator('.sample-coordinates')).toContainText(`X ${originalX + 1}`);
  await sample.getByRole('button', { name: '像素放大镜' }).tap();
  await expect(sample.locator('.sample-magnifier')).toHaveCount(0);
  await sample.getByRole('button', { name: '像素放大镜' }).tap();
  await sample.getByRole('button', { name: '收起', exact: true }).tap();

  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 720; c.height = 480;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#123456'; ctx.fillRect(0, 0, 720, 480);
    ctx.fillStyle = '#abcdef'; ctx.fillRect(361, 240, 1, 1);
    return c.toDataURL().split(',')[1];
  });
  await field.locator('.color-actions input[type=file]').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(sample.locator('.sample-coordinates')).toHaveText('X 360 · Y 240');
  await sample.getByRole('button', { name: '向右移动一个像素' }).tap();
  await expect(sample.locator('.sample-color-value')).toHaveText('#ABCDEF');
  assert.deepEqual(await sample.locator('.sample-magnifier').evaluate(c => [...c.getContext('2d').getImageData(66, 66, 1, 1).data]), [171, 205, 239, 255]);
  await sample.screenshot({ path: '.local/qa/mobile-pixel-sampler.png' });
  await sample.getByRole('button', { name: '使用这个颜色' }).tap();
  await expect(field.getByRole('spinbutton').nth(0)).toHaveValue('171');
  await expect(field.getByRole('spinbutton').nth(1)).toHaveValue('205');
  await expect(field.getByRole('spinbutton').nth(2)).toHaveValue('239');

  // A newly uploaded screenshot also defaults to template rendering.
  const upload = await page.evaluate(matrix => {
    const c = document.createElement('canvas'); c.width = matrix.length * 12; c.height = c.width + 120;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#e621b8'; ctx.fillRect(0, 0, c.width, 60);
    ctx.fillStyle = '#000000';
    matrix.forEach((row, y) => row.forEach((cell, x) => { if (cell) ctx.fillRect(x * 12, 120 + y * 12, 12, 12); }));
    return c.toDataURL().split(',')[1];
  }, encodeQR('wxp://linkora-pixel-qa', 'raw', { border: 4, ecc: 'high' }));
  await card.locator('.dropzone input[type=file]').setInputFiles({ name: 'code.png', mimeType: 'image/png', buffer: Buffer.from(upload, 'base64') });
  await expect(page.locator('.code-upload.has-code')).toHaveCount(1);
  await expect(card.getByText('二维码显示', { exact: true })).toHaveCount(0);
  await expect(card.getByRole('button', { name: '保持原图', exact: true })).toHaveCount(0);
  await settled(page);
  const styled = await preview(page);
  await field.getByRole('button', { name: '预览取色', exact: true }).tap();
  await expect(sample.locator('.sample-coordinates')).toBeVisible();
  assert.equal(await sample.locator('.sample-source').evaluate(c => c.toDataURL()), styled);
  // Exercise a touch drag while retaining selection until explicit confirmation.
  const source = sample.locator('.sample-source');
  await source.scrollIntoViewIfNeeded();
  const box = await source.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  for (const [type, p] of [['touchStart', .25], ['touchMove', .7], ['touchEnd', .7]]) {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: box.x + box.width * p, y: box.y + box.height * .4 }] });
  }
  await expect(sample.locator('.sample-crosshair')).toBeVisible();
  await sample.getByRole('button', { name: '收起', exact: true }).tap();
  await card.getByRole('button', { name: '移除', exact: true }).tap();
  await expect(page.locator('.code-upload.has-code')).toHaveCount(0);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await field.getByRole('button', { name: '预览取色', exact: true }).tap();
    await expect(sample.locator('.sample-coordinates')).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await sample.getByRole('button', { name: '收起', exact: true }).tap();
  }
  assert.deepEqual(errors, []);
  console.log('Passed: empty SSR upload state; uploaded styled rendering; preview pixel equality; exact original-image sampling; magnifier; touch drag; per-pixel adjustment; mobile widths 320/390/430.');
} finally { await browser.close(); }
