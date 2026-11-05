// 水杉 Metasequoia — 真实页面冒烟测试 + 全页面截图
// 1) 启动本地静态服务器托管 www（ES Module 需正确 MIME）
// 2) 用 Playwright 加载应用，断言本次新增控件确实接在 DOM 上（功能冒烟）
// 3) 对空书架 / 平铺书架 / 分组书架 / 阅读器 / 设置页 / AI 面板 / 统计页 各截一张图
// 运行：node tests/capture-screenshots.mjs
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../www', import.meta.url));
const OUT = fileURLToPath(new URL('../docs/screenshots', import.meta.url));
const PORT = 5188;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const fp = normalize(join(ROOT, p));
    if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    const data = await readFile(fp);
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));
await mkdir(OUT, { recursive: true });
console.log('静态服务器已启动: http://localhost:' + PORT);

// 种子书：示例书（内联，不再依赖已删除的 books/sample.js）+ 一本技术书，各带 AI 标签
const book1 = {
  id: 'builtin-sample-shouji', title: '示例书·手记', author: '佚名', source: 'txt',
  addedAt: Date.now() - 2000,
  chapters: [
    { title: '第一章 起', html: '<p>这是一段示例正文，用于展示阅读与翻页效果。</p><p>第二段内容继续展开。</p>' },
    { title: '第二章 承', html: '<p>翻过一页，故事仍在继续。</p>' },
  ],
  ai: { tags: ['小说', '随笔'] },
};
const book2 = {
  id: 'seed-2', title: '深入浅出推荐系统', author: '佚名', source: 'txt',
  addedAt: Date.now() - 1000,
  chapters: [
    { title: '第1章 推荐系统的前世今生', html: '<p>推荐系统是一类信息过滤系统。</p><p>它试图预测用户对物品的偏好。</p>' },
    { title: '第2章 协同过滤', html: '<p>协同过滤分为基于用户与基于物品两类。</p>' },
  ],
  ai: { tags: ['技术', '工具'] },
};

async function seedIDB(page) {
  await page.evaluate(async (books) => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('inkreader', 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' }); };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('books', 'readwrite');
        const st = tx.objectStore('books');
        books.forEach((b) => st.put(b));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, [book1, book2]);
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

const browser = await chromium.launch();

// ---------- 场景 A：空书架（独立干净上下文）----------
console.log('\n=== 场景 A：空书架冒烟 ===');
const ctxEmpty = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
await ctxEmpty.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
const pA = await ctxEmpty.newPage();
const errorsA = [];
pA.on('pageerror', (e) => errorsA.push(String(e)));
await pA.goto('http://localhost:' + PORT + '/', { waitUntil: 'networkidle' });
await pA.waitForTimeout(400);
ok(await pA.locator('#shelf-empty').isVisible(), '空书架：显示空状态文案');
ok((await pA.locator('.book-card').count()) === 0, '空书架：无书籍卡片');
ok(errorsA.length === 0, '空书架：无 JS 运行时报错' + (errorsA.length ? ' → ' + errorsA.join('; ') : ''));
await pA.screenshot({ path: join(OUT, '01-shelf-empty.png') });
await ctxEmpty.close();

// ---------- 场景 B：带书 + 分组 + 各面板 ----------
console.log('\n=== 场景 B：书架 / 阅读 / 设置 / AI / 统计 冒烟 + 截图 ===');
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
await ctx.addInitScript(() => {
  const q = new URLSearchParams(location.search);
  const ls = window.localStorage;
  if (!ls.getItem('inkreader:stats')) {
    const d = new Date();
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    ls.setItem('inkreader:stats', JSON.stringify({
      [k]: { byBook: { 'builtin-sample-shouji': 35 * 60000, 'seed-2': 18 * 60000 }, checkin: true, checkinAt: Date.now() },
    }));
  }
  const settings = JSON.parse(ls.getItem('inkreader:settings') || '{}');
  settings.shelfGroupByTag = q.get('group') === '1';
  if (typeof settings.checkinGoalMin !== 'number') settings.checkinGoalMin = 10;
  ls.setItem('inkreader:settings', JSON.stringify(settings));
});
const page = await ctx.newPage();
const errorsB = [];
page.on('pageerror', (e) => errorsB.push(String(e)));

// 先空跑一次以拿到 DB，再注入种子书
await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'networkidle' });
await seedIDB(page);

// B1：平铺书架
await page.goto('http://localhost:' + PORT + '/?group=0', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const cardCount = await page.locator('.book-card').count();
ok(cardCount === 2, '平铺书架：渲染 2 本书卡片（实际 ' + cardCount + '）');
ok(await page.locator('#tag-filter .tag-chip').count() >= 2, '平铺书架：顶部出现 AI 标签筛选条');
ok(errorsB.length === 0, '平铺书架：无 JS 运行时报错' + (errorsB.length ? ' → ' + errorsB.join('; ') : ''));
await page.screenshot({ path: join(OUT, '02-shelf-flat.png') });

// B2：按类型分组书架
await page.goto('http://localhost:' + PORT + '/?group=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
ok(await page.locator('#book-list.grouped').count() === 1, '分组书架：#book-list 带上 grouped 标记');
ok((await page.locator('.group-header').count()) >= 2, '分组书架：出现至少 2 个类型分组头');
await page.screenshot({ path: join(OUT, '03-shelf-grouped.png') });

// B3：阅读器（打开放在首位的书）
await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.locator('.book-card').first().click({ position: { x: 12, y: 12 } });
await page.waitForTimeout(500);
ok(await page.locator('#reader').isVisible(), '阅读器：打开后可见');
ok((await page.locator('#page').innerText()).length > 0, '阅读器：正文已分页渲染');
// 点屏幕中部唤出底栏（默认收起）
await page.locator('#page-viewport').click({ position: { x: 195, y: 400 } });
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, '03-reader.png') });

// B4：AI 面板（仍在阅读器中，右侧滑面板）
await page.locator('#btn-ai').click();
await page.waitForTimeout(300);
ok(await page.locator('#panel-ai.open').count() === 1, 'AI 面板：可打开');
ok(await page.locator('#ai-gen-guide').count() === 1, 'AI 面板：含「生成全书导读」按钮');
await page.screenshot({ path: join(OUT, '05-ai-panel.png') });
await page.locator('#panel-ai .panel-close').click();
await page.waitForTimeout(150);

// 返回书架，改用底部导航进入独立页面
await page.locator('#btn-back').click();
await page.waitForTimeout(300);

// B5：设置页（独立页面：主题皮肤色板 + 打卡阈值 + 书架分组开关 + 翻页动画）
ok(await page.locator('#tabbar').isVisible(), '返回书架后底部导航栏可见');
await page.locator('#tabbar .tab[data-view="settings"]').click();
await page.waitForTimeout(300);
ok(await page.locator('#view-settings').isVisible(), '设置页：独立页面可打开');
ok((await page.locator('#theme-swatches .swatch').count()) >= 6, '设置页：主题皮肤色板至少 6 个');
ok(await page.locator('#set-checkin').count() === 1, '设置页：含「打卡阈值」滑块');
ok(await page.locator('#set-group-tag').count() === 1, '设置页：含「书架按 AI 类型分组」开关');
ok(await page.locator('#set-flip').count() === 1, '设置页：含「翻页动画」开关');
// 先截顶部（主题皮肤色板 + 字体 + 排版 + 屏幕与翻页），再滚到底截 AI 引擎 + 阅读与书架
await page.evaluate(() => { const el = document.querySelector('#view-settings .settings-body'); if (el) el.scrollTop = 0; });
await page.waitForTimeout(120);
await page.screenshot({ path: join(OUT, '04-settings.png') });
await page.evaluate(() => { const el = document.querySelector('#view-settings .settings-body'); if (el) el.scrollTop = el.scrollHeight; });
await page.waitForTimeout(150);
await page.screenshot({ path: join(OUT, '04b-settings-ai.png') });

// B6：统计页（独立页面，日）
await page.locator('#tabbar .tab[data-view="stats"]').click();
await page.waitForTimeout(300);
ok(await page.locator('#view-stats').isVisible(), '统计页：独立页面可打开');
ok(await page.locator('#ss-total').innerText().then((t) => /分钟/.test(t)), '统计页：显示总时长');
ok((await page.locator('.stats-book-row').count()) >= 2, '统计页：列出各书阅读时长');
await page.screenshot({ path: join(OUT, '06-stats-day.png') });

// B7：统计页（周）
await page.locator('.stats-tab[data-stats-tab="week"]').click();
await page.waitForTimeout(200);
ok(await page.locator('.stats-tab[data-stats-tab="week"].active').count() === 1, '统计页：周 tab 可切换');
await page.screenshot({ path: join(OUT, '07-stats-week.png') });

ok(errorsB.length === 0, '全场景：无 JS 运行时报错' + (errorsB.length ? ' → ' + errorsB.join('; ') : ''));
await ctx.close();

await browser.close();
server.close();
console.log('\n通过 ' + pass + ' / 失败 ' + fail);
console.log('截图输出目录: ' + OUT);
process.exit(fail ? 1 : 0);
