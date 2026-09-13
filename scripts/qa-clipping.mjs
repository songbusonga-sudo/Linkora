import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

// Exercise the actual renderer at preview and export resolutions in Chrome.
const bundle = await build({
  stdin: { contents: 'export { drawTemplate } from "./src/lib/render"; export { emptyEdits } from "./src/lib/model"; export { presetStyle } from "./src/lib/qr";', resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'clippingQA', platform: 'browser',
});
mkdirSync('.local/qa', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:8982/admin');
  await page.getByLabel('管理员密码').fill(readFileSync('.local/admin-access.txt', 'utf8').match(/^Password: (.+)$/m)[1]);
  await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  await page.getByRole('button', { name: '保存草稿', exact: true }).waitFor();
  const before = await page.request.get('http://localhost:8982/api/admin').then(r => r.json());
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async template => {
    const { drawTemplate, emptyEdits, presetStyle } = clippingQA;
    const t = structuredClone(template);
    delete t.defaults;
    t.options = [];
    const styles = { wechat: presetStyle(), alipay: presetStyle() };
    const solid = document.createElement('canvas'); solid.width = solid.height = 20;
    const sc = solid.getContext('2d'); sc.fillStyle = '#e31a92'; sc.fillRect(0, 0, 20, 20);
    const src = solid.toDataURL();
    const reports = [];
    for (const role of ['wechat', 'alipay', 'reward']) {
      const original = t.nodes.find(n => n.role === role);
      const frame = t.nodes.find(n => n.id === original.id.split('-')[0] + '-0');
      const members = t.nodes.filter(n => n.id === original.id || (role === 'reward' && n.id.startsWith('7-') && n.id !== '7-0'));
      // Isolate each PSD group so unrelated asynchronously decoded photos do
      // not introduce GPU image-cache rounding differences between samples.
      const baseline = { ...t, nodes: [frame] };
      for (const mode of role === 'reward' ? ['source', 'crop', 'overlays'] : ['source', 'generated']) {
        const oversized = members.map(n => ({ ...n, visible: n.id === original.id || mode === 'overlays', src, colorEditable: false, clipTo: undefined,
          x: frame.x - 160, y: frame.y - 140, width: frame.width + 340, height: frame.height + 340 }));
        const altered = { ...t, nodes: [frame, ...oversized] };
        const codes = mode === 'generated' ? { [role]: { content: 'https://example.com/clip-test', confirmed: true, image: src } }
          : mode === 'crop' ? { reward: { image: src, confirmed: true, crop: { x: 0, y: 0, size: 20 } } } : {};
        for (const scale of [1000 / t.width, 2]) {
          const base = await drawTemplate(baseline, emptyEdits(), {}, styles, scale);
          const out = await drawTemplate(altered, emptyEdits(), codes, styles, scale);
          const a = base.getContext('2d').getImageData(0, 0, base.width, base.height).data;
          const b = out.getContext('2d').getImageData(0, 0, out.width, out.height).data;
          let outside = 0, changed = 0;
          const cx = frame.x + frame.width / 2, cy = frame.y + frame.height / 2;
          const rx = frame.width / 2 - 18.05 * frame.width / 371;
          const ry = frame.height / 2 - 18.05 * frame.height / (role === 'reward' ? 371 : 372);
          for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
            const i = (y * out.width + x) * 4;
            if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3]) continue;
            changed++;
            const dx = Math.abs((x + .5) / scale - cx), dy = Math.abs((y + .5) / scale - cy), tolerance = 2 / scale;
            const radius = 23 * Math.min(frame.width / 371, frame.height / 372);
            const inMask = role === 'reward' ? (dx / (rx + tolerance)) ** 2 + (dy / (ry + tolerance)) ** 2 <= 1
              : dx <= rx + tolerance && dy <= ry + tolerance
                && Math.hypot(Math.max(0, dx - rx + radius), Math.max(0, dy - ry + radius)) <= radius + tolerance;
            if (!inMask) outside++;
          }
          reports.push({ role, mode, scale, outside, changed, ...(outside && reports.length === 0 ? { base: base.toDataURL(), out: out.toDataURL() } : {}) });
        }
      }
    }
    return reports;
  }, before.templates[0].draft);
  for (const r of result) {
    if (r.base) {
      writeFileSync('.local/qa/clip-base.png', Buffer.from(r.base.split(',')[1], 'base64'));
      writeFileSync('.local/qa/clip-out.png', Buffer.from(r.out.split(',')[1], 'base64'));
      delete r.base; delete r.out;
    }
    assert.equal(r.outside, 0, JSON.stringify(r));
    assert.ok(r.changed > 1000, JSON.stringify(r));
  }
  const after = await page.request.get('http://localhost:8982/api/admin').then(r => r.json());
  assert.deepEqual(after.templates, before.templates);
  console.log('Clipping pixel QA passed:', result.length, 'source/generated/cropped/overlay cases at preview and 4096px export sizes; outside pixels and frames unchanged.');
} finally { await browser.close(); }
