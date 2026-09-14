import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Exercise the real renderer and bundled PSD artwork without server writes.
const sources = [2, 3, 4, 5, 6].map(i =>
  'data:image/png;base64,' + readFileSync(`public/private-assets/layer-7-2-${i}.png`).toString('base64'));
const bundle = await build({ stdin: {
  contents: 'export { drawTemplate } from "./src/lib/render"; export { emptyEdits } from "./src/lib/model"; export { presetStyle } from "./src/lib/qr";',
  resolveDir: process.cwd(),
}, bundle: true, write: false, format: 'iife', globalName: 'presetQA', platform: 'browser' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async sources => {
    const { drawTemplate, emptyEdits, presetStyle } = presetQA;
    const solid = document.createElement('canvas'); solid.width = solid.height = 128;
    const sc = solid.getContext('2d'); sc.fillStyle = '#fff'; sc.fillRect(0, 0, 128, 128);
    const white = solid.toDataURL();
    sc.fillStyle = '#e34477'; sc.fillRect(0, 0, 128, 128);
    const photo = solid.toDataURL();
    const base = { x: 0, y: 0, width: 128, height: 128, opacity: 1, visible: true,
      colorEditable: false, contentEditable: false, color: '#a0a0a0' };
    const t = { width: 128, height: 128, font: '', assets: [], nodes: [
      { ...base, id: 'backing', role: 'image', src: white },
      { ...base, id: 'avatar', role: 'rewardAvatar', src: white, contentEditable: true },
      ...sources.map((src, i) => ({ ...base, id: `preset-${i}`, role: 'image', src, clipTo: 'avatar' })),
    ], options: [{ id: 'reward-avatar', replacementNodeId: 'avatar', defaultId: '0',
      choices: sources.map((_, i) => ({ id: String(i), nodeIds: [`preset-${i}`] })) }] };
    const original = JSON.stringify(t);
    const styles = { wechat: presetStyle(), alipay: presetStyle() };
    const checks = [];
    const montage = document.createElement('canvas'); montage.width = 640; montage.height = 256;
    const mc = montage.getContext('2d');
    for (const scale of [960 / 2048, 1200 / 2048, 1000 / 2048, 2]) {
      for (const [row, color] of ['#285ca3', '#be3040'].entries()) {
        for (let i = 0; i < sources.length; i++) {
          const edits = { ...emptyEdits(), choices: { 'reward-avatar': String(i) }, codeColors: { ink: color } };
          const c = await drawTemplate(t, edits, {}, styles, scale);
          const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let colored = 0, gray = 0;
          for (let j = 0; j < pixels.length; j += 4) {
            if (pixels[j + 3] < 128) continue;
            if (Math.min(...pixels.slice(j, j + 3)) > 235) continue;
            if (row === 0 ? pixels[j + 2] > pixels[j] + 10 : pixels[j] > pixels[j + 2] + 10) colored++;
            if (Math.max(...pixels.slice(j, j + 3)) - Math.min(...pixels.slice(j, j + 3)) < 3) gray++;
          }
          checks.push({ scale, color, preset: i, colored, gray });
          if (scale === 2) mc.drawImage(c, i * 128, row * 128, 128, 128);
        }
      }
      const uploaded = await drawTemplate(t, { ...emptyEdits(), images: { avatar: photo }, codeColors: { ink: '#285ca3' } }, {}, styles, scale);
      checks.push({ photo: [...uploaded.getContext('2d').getImageData(20, 20, 1, 1).data] });
    }
    return { checks, unchanged: original === JSON.stringify(t), montage: montage.toDataURL() };
  }, sources);
  assert.equal(result.unchanged, true);
  for (const sample of result.checks) {
    if (sample.photo) assert.deepEqual(sample.photo, [227, 68, 119, 255]);
    else {
      assert.ok(sample.colored > 50, JSON.stringify(sample));
      assert.equal(sample.gray, 0, JSON.stringify(sample));
    }
  }
  mkdirSync('.local/qa', { recursive: true });
  writeFileSync('.local/qa/preset-avatar-colors.png', Buffer.from(result.montage.split(',')[1], 'base64'));
  console.log('Passed: five real presets in blue/red at desktop/mobile preview and export scales; uploaded photo and template geometry preserved.');
} finally { await browser.close(); }
