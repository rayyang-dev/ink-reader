// 验证新增导入格式：FB2 / HTML / DOCX
// 1) 启动本地静态服务器托管 www
// 2) 用 Python 生成三种格式的样例文件
// 3) 通过真实 UI 的隐藏 file input 触发导入，断言：无 JS 报错、书架新增卡片、TOC 章节数 > 0
// 运行：node tests/verify-formats.mjs
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../www', import.meta.url));
const TMP = fileURLToPath(new URL('../tests/.tmp-formats', import.meta.url));
const PORT = 5191;

// ---------- 生成样例文件（Python）----------
const GEN = `
import os, zipfile
root = r'''${TMP.replace(/\\\\/g, '\\\\')}'''
os.makedirs(root, exist_ok=True)

# FB2
fb2 = '''<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <genre>sf</genre>
      <author><first-name>测试</first-name><last-name>作者</last-name></author>
      <book-title>虚构之书 FB2</book-title>
    </title-info>
  </description>
  <body>
    <section>
      <title><p>第一章 开端</p></title>
      <p>这是 FB2 的第一段正文。</p>
      <p>第二段继续展开。</p>
    </section>
    <section>
      <title><p>第二章 发展</p></title>
      <p>FB2 的第二章内容，包含更多文字用于分页测试。</p>
    </section>
  </body>
</FictionBook>'''
open(os.path.join(root, 'sample.fb2'), 'w', encoding='utf-8').write(fb2)

# HTML
html = '''<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>测试网页 HTML</title></head>
<body>
<h1>网页主标题</h1>
<p>这是网页的第一段正文内容。</p>
<h2>小节一</h2>
<p>这是小节一下的具体内容。</p>
<h2>小节二</h2>
<p>这是小节二下的具体内容。</p>
</body></html>'''
open(os.path.join(root, 'sample.html'), 'w', encoding='utf-8').write(html)

# DOCX（最小可用 OOXML，fflate 解压）
document = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>文档标题</w:t></w:r></w:p>
<w:p><w:r><w:t>这是 DOCX 的正文第一段。</w:t></w:r></w:p>
<w:p><w:r><w:t>这是 DOCX 的正文第二段，用于分页。</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>小节标题</w:t></w:r></w:p>
<w:p><w:r><w:t>小节下的具体内容段落。</w:t></w:r></w:p>
</w:body></w:document>'''
styles = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
</w:styles>'''
core = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>测试文档 DOCX</dc:title>
<dc:creator>文档作者</dc:creator>
</cp:coreProperties>'''
ct = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
</Types>'''
with zipfile.ZipFile(os.path.join(root, 'sample.docx'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', ct)
    z.writestr('word/document.xml', document)
    z.writestr('word/styles.xml', styles)
    z.writestr('docProps/core.xml', core)
print('samples-ready')
`;
await mkdir(TMP, { recursive: true });
const genPath = join(TMP, 'gen.py');
await writeFile(genPath, GEN, 'utf-8');
console.log('[gen] 生成样例文件…');
console.log(execFileSync('python', [genPath], { encoding: 'utf-8' }));

// ---------- 静态服务器 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.fb2': 'application/xml', '.html': 'text/html', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(PORT, r));
console.log('静态服务器已启动: http://localhost:' + PORT);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
await ctx.addInitScript(() => { try { localStorage.clear(); indexedDB.deleteDatabase('inkreader'); } catch (e) {} });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.dismiss().catch(() => {}));

await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
ok(await page.locator('#shelf-empty').isVisible(), '初始：空书架可见');

const cases = [
  { id: 'fb2', input: '#file-fb2', file: 'sample.fb2', titleMatch: '虚构之书', minToc: 2 },
  { id: 'html', input: '#file-html', file: 'sample.html', titleMatch: '测试网页', minToc: 3 },
  { id: 'docx', input: '#file-docx', file: 'sample.docx', titleMatch: '测试文档', minToc: 2 },
];

for (const c of cases) {
  console.log('\n=== 导入 ' + c.id.toUpperCase() + ' ===');
  const before = await page.locator('.book-card').count();
  await page.setInputFiles(c.input, join(TMP, c.file));
  await page.waitForTimeout(600);
  const after = await page.locator('.book-card').count();
  ok(after === before + 1, '书架新增 1 张卡片（' + before + ' → ' + after + '）');
  // 卡片标题应反映解析结果（按书名定位该卡片，因为书架按 id 字母序排列并非插入序）
  const card = page.locator('.book-card', { hasText: c.titleMatch }).first();
  ok(await card.count() === 1, '书架出现该书卡片（书名含「' + c.titleMatch + '」）');
  const cardTitle = await card.locator('.bc-title').innerText();
  ok(cardTitle.includes(c.titleMatch), '卡片标题含解析出的书名（实际：' + JSON.stringify(cardTitle) + '）');
  // 卡片副标题应含章节数（"N 章"）
  const meta = await card.locator('.bc-meta').innerText();
  const m = meta.match(/(\d+)\s*章/);
  ok(m && parseInt(m[1], 10) >= c.minToc, '卡片章节数 ≥ ' + c.minToc + '（实际「' + meta + '」）');
  // 打开该书：阅读器可见 + 正文已分页渲染
  await card.click({ position: { x: 12, y: 12 } });
  await page.waitForTimeout(500);
  ok(await page.locator('#reader').isVisible(), '阅读器打开成功');
  const pageText = (await page.locator('#page').innerText()).trim();
  ok(pageText.length > 0, '正文已分页渲染（长度 ' + pageText.length + '）');
  const tocDirect = await page.locator('#toc-list .toc-item').allInnerTexts();
  console.log('     该书 TOC 章节: ' + JSON.stringify(tocDirect));
  // 阅读器默认隐藏工具栏：点页面中部揭示，再用顶部「目录」核对 TOC
  await page.locator('#page-viewport').click({ position: { x: 195, y: 420 } });
  await page.waitForTimeout(200);
  await page.locator('#btn-toc-top').click();
  await page.waitForTimeout(300);
  const toc = await page.locator('#panel-toc .toc-item').count();
  ok(toc >= c.minToc, 'TOC 章节数 ≥ ' + c.minToc + '（实际 ' + toc + '）');
  // 返回书架准备下一个
  await page.locator('#panel-toc .panel-close').click();
  await page.waitForTimeout(150);
  await page.locator('#btn-back').click();
  await page.waitForTimeout(300);
}

ok(errors.length === 0, '全程无 JS 运行时报错' + (errors.length ? ' → ' + errors.join('; ') : ''));

await ctx.close();
await browser.close();
server.close();
console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
