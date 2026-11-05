// 水杉 Metasequoia —— headless 冒烟测试（puppeteer-core + 系统 Chrome）
// 用途：每次改动后跑一遍，作为“打包前闸门”，验证：
//   ① app.js 正常加载、无致命报错（按钮接线正常）
//   ② 书架按钮可点中（不被遮挡）
//   ③ 导入 EPUB 后阅读器打开、封面/图片内联（无裂图）
//   ④ 控制条按钮（翻页/目录）可点中
//   ⑤ 连续翻页后按钮仍可被点中、且能翻到正文页（分页正常）
// 说明：Capacitor 原生能力（返回键/退出）在纯浏览器不存在属正常；app.js 已对 window.Capacitor 容错，不产生阻断报错。
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('www');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const BASE = `http://localhost:${port}/`;
console.log('static server:', BASE);

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 892 }); // 手机尺寸

const errors = [];
const dialogs = [];
page.on('console', (m) => {
  if (m.type() === 'error') {
    const txt = m.text();
    const loc = m.location();
    const url = (loc && loc.url) || '';
    if (/favicon\.ico/i.test(url) || /favicon/i.test(txt)) return; // 良性噪音
    errors.push('CONSOLE: ' + txt);
  }
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e && e.message ? e.message : e)));
page.on('dialog', async (d) => { dialogs.push(d.message()); try { await d.dismiss(); } catch (e) {} });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function clickableReport(sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, exists: false };
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return { sel, exists: true, visible: false, w: 0, h: 0 };
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    const covered = !(top === el || el.contains(top));
    return { sel, exists: true, visible: true, w: Math.round(r.width), h: Math.round(r.height), covered };
  }, sel);
}
// 点 page-viewport 中央以唤出/收起控制条；点右侧翻下一页
async function tapViewport(where) {
  await page.evaluate((where) => {
    const vp = document.querySelector('#page-viewport');
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    let x = r.left + r.width / 2;
    if (where === 'right') x = r.left + r.width * 0.85;
    if (where === 'left') x = r.left + r.width * 0.15;
    vp.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: r.top + r.height / 2 }));
  }, where);
}

const report = { steps: [] };
const EPUB = 'C:/Users/杨睿/Desktop/雍正帝：中国的独裁君主.epub';
try {
  // —— 1) 加载 ——
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(800);

  // 切到简约主题（测试水平滑动翻页），持久化后重载
  await page.evaluate(() => {
    try { const s = JSON.parse(localStorage.getItem('inkreader-settings') || '{}'); s.theme = 'simple'; localStorage.setItem('inkreader-settings', JSON.stringify(s)); } catch (e) {}
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await wait(800);

  // —— 2) 书架按钮可点中 ——
  const shelf = await clickableReport('#import-epub');
  report.steps.push({ name: '书架 #import-epub 可点中', ...shelf, pass: shelf.exists && shelf.visible && !shelf.covered });

  // —— 3) 导入《雍正帝》EPUB ——
  const input = await page.$('#file-epub');
  if (!input) throw new Error('#file-epub 输入控件不存在');
  await input.uploadFile(EPUB);
  // 等待书架出现该书（导入完成）
  await page.waitForFunction(() => document.querySelectorAll('.book-card').length >= 1, { timeout: 25000 }).catch(() => {});
  // 点击该书卡打开阅读器
  await page.evaluate(() => { const c = document.querySelector('#shelf .book-card') || document.querySelector('.book-card'); if (c) c.click(); });
  await page.waitForFunction(() => { const r = document.querySelector('#reader'); return !!r && !r.classList.contains('hidden'); }, { timeout: 15000 }).catch(() => {});
  const readerOpen = await page.evaluate(() => { const r = document.querySelector('#reader'); return !!r && !r.classList.contains('hidden'); });
  const imgState = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('#page img, #page image')];
    const inlined = imgs.filter((i) => {
      const a = i.getAttribute('src') || i.getAttribute('href') || i.getAttribute('xlink:href') || '';
      return /^(data:|blob:)/i.test(a);
    }).length;
    return { total: imgs.length, inlined };
  });
  report.steps.push({
    name: '导入EPUB-阅读器打开且图片内联',
    readerOpen, ...imgState, dialogs: dialogs.length,
    pass: readerOpen && imgState.total > 0 && imgState.inlined === imgState.total && dialogs.length === 0
  });

  // —— 4) 点中央唤出控制条，检查控制条按钮可点中 ——
  await tapViewport('center');
  await wait(300);
  const btnNext = await clickableReport('#btn-next');
  const btnToc = await clickableReport('#btn-toc');
  report.steps.push({ name: '控制条 #btn-next 可点中', ...btnNext, pass: btnNext.exists && btnNext.visible && !btnNext.covered });
  report.steps.push({ name: '控制条 #btn-toc 可点中', ...btnToc, pass: btnToc.exists && btnToc.visible && !btnToc.covered });

  // —— 5) 连续翻页：翻到正文页（验证分页有文字）+ 按钮持续可点中 ——
  let foundText = false;
  for (let i = 0; i < 6; i++) {
    const t = await page.evaluate(() => { const p = document.querySelector('#page'); return p ? p.innerText.trim().length : 0; });
    if (t > 50) { foundText = true; break; }
    await tapViewport('right');
    await wait(450);
  }
  // 最后再唤出控制条确认按钮仍可被点中
  await tapViewport('center');
  await wait(300);
  const btnNext2 = await clickableReport('#btn-next');
  report.steps.push({ name: '翻页至正文页（分页有文字）', foundText, pass: foundText });
  report.steps.push({ name: '连续翻页后 #btn-next 可点中', ...btnNext2, pass: btnNext2.exists && btnNext2.visible && !btnNext2.covered });
} catch (e) {
  report.fatal = e.message;
}

report.errors = errors;
report.dialogs = dialogs;
const failed = report.steps.filter((s) => s.pass === false).length;
report.summary = { total: report.steps.length, failed, errors: errors.length, dialogs: dialogs.length };
console.log('\n==== 测试结果 ====');
console.log(JSON.stringify(report, null, 2));

await browser.close();
server.close();
process.exit(report.summary.failed === 0 && report.summary.errors === 0 && report.summary.dialogs === 0 && !report.fatal ? 0 : 1);
