// 砚白 Inkstone —— 主控逻辑
import {
  loadSettings, saveSettings, DEFAULT_SETTINGS,
  putBook, getBook, deleteBook, listBooksMeta,
  loadProgress, saveProgress, getProgress,
  loadBookmarks, saveBookmarks,
} from './store.js';
import { paginateChapter, chapterCharCount } from './paginate.js';
import { parseTxt, parseEpub, parsePdf, parseMobi } from './importers.js';
import { openPdf, renderPdfPage } from './pdfview.js';
import { translateText } from './translate.js';
import {
  aiConfigured, aiSummary, aiExplain, aiAsk, aiNotes, aiTags, aiBilingual, pageParagraphs, renderMarkdown,
} from './ai.js';
import { SAMPLE_BOOK } from '../books/sample.js';

const FONT_STACK = {
  serif: 'Georgia, "Songti SC", "Noto Serif SC", "Source Han Serif SC", serif',
  sans: '-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  mono: '"Courier New", "Noto Sans Mono", monospace',
};

// ---------- 状态 ----------
let settings = loadSettings();
let currentBook = null;
let ci = 0; // 当前章节
let pi = 0; // 当前页（章内）
let pages = []; // 当前章分页结果
let chapterChars = [];
let totalChars = 0;
let turnCounter = 0;
const pageCache = new Map(); // ci + 设置哈希 -> 分页
let repTimer = null;
let currentPdfDoc = null; // PDF 阅读时持有的 pdf.js doc
const pdfImageCache = new Map(); // ci -> 已渲染的图片 dataURL

const $ = (id) => document.getElementById(id);

// 复杂/加密的 Kindle 格式（AZW3/KFX 多为加密或 KF8 复杂结构），浏览器内无法可靠解析，引导 Calibre
// 注：.mobi / .azw（无加密）已由 mobidec.js 在应用内直接解析导入
const KINDLE_RE = /\.(azw3|kfx)$/i;

// ---------- 设置 -> DOM ----------
function applySettings() {
  const b = document.body;
  b.dataset.theme = settings.theme;
  b.dataset.font = settings.fontFamily;
  b.style.setProperty('--r-font-size', settings.fontSize + 'px');
  b.style.setProperty('--r-line-height', String(settings.lineHeight));
  b.style.setProperty('--r-font-family', FONT_STACK[settings.fontFamily]);
  b.style.setProperty('--r-letter-spacing', settings.letterSpacing + 'px');
  b.style.setProperty('--r-margin', settings.margin + 'px');
  b.style.setProperty('--r-para-space', settings.paragraphSpacing + 'em');
  b.style.setProperty('--r-indent', settings.firstLineIndent ? '2em' : '0');
  b.style.setProperty('--r-justify', settings.justify ? 'justify' : 'left');
  syncSettingsUI();
}

function syncSettingsUI() {
  setSeg('seg-theme', settings.theme);
  setSeg('seg-font', settings.fontFamily);
  setSeg('seg-regal', String(settings.regalRefresh));
  $('set-fontsize').value = settings.fontSize;
  $('val-fontsize').textContent = settings.fontSize + 'px';
  $('set-lineheight').value = settings.lineHeight;
  $('val-lineheight').textContent = settings.lineHeight.toFixed(2);
  $('set-margin').value = settings.margin;
  $('val-margin').textContent = settings.margin + 'px';
  $('set-paraspacing').value = settings.paragraphSpacing;
  $('val-paraspacing').textContent = settings.paragraphSpacing.toFixed(1) + 'em';
  $('set-letterspacing').value = settings.letterSpacing;
  $('val-letterspacing').textContent = settings.letterSpacing + 'px';
  $('set-justify').checked = settings.justify;
  $('set-indent').checked = settings.firstLineIndent;
  setSeg('seg-translate-provider', settings.translateProvider);
  setSeg('seg-tdir', settings.translateDir);
  $('set-tkey').value = settings.translateApiKey || '';
  $('set-tbase').value = settings.translateLlmBase || 'https://api.openai.com/v1';
  $('set-tmodel').value = settings.translateLlmModel || 'gpt-4o-mini';
  $('set-ai-auto').checked = !!settings.aiAutoSummary;
  updateTranslateFieldsVisibility();
}

function setSeg(id, val) {
  $(id).querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.val === String(val));
  });
}

// ---------- 书架 ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let activeTagFilter = null;

async function renderShelf() {
  const list = await listBooksMeta();
  const el = $('book-list');
  const empty = $('shelf-empty');
  const hint = $('drop-hint');
  const filter = $('tag-filter');
  el.innerHTML = '';
  if (!list.length) {
    el.classList.add('hidden');
    empty.classList.remove('hidden');
    hint.classList.add('hidden');
    filter.classList.add('hidden');
    filter.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  empty.classList.add('hidden');
  hint.classList.remove('hidden');

  // 顶部标签筛选条：汇总所有书的 AI 标签
  const tagCount = new Map();
  list.forEach((b) => (b.aiTags || []).forEach((t) => tagCount.set(t, (tagCount.get(t) || 0) + 1)));
  if (tagCount.size) {
    filter.classList.remove('hidden');
    filter.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = 'tag-chip' + (activeTagFilter === null ? ' active' : '');
    allBtn.textContent = '全部';
    allBtn.addEventListener('click', () => { activeTagFilter = null; renderShelf(); });
    filter.appendChild(allBtn);
    Array.from(tagCount.keys()).forEach((t) => {
      const c = document.createElement('button');
      c.className = 'tag-chip' + (activeTagFilter === t ? ' active' : '');
      c.textContent = t;
      c.addEventListener('click', () => { activeTagFilter = t; renderShelf(); });
      filter.appendChild(c);
    });
  } else {
    filter.classList.add('hidden');
    filter.innerHTML = '';
  }

  const shown = activeTagFilter ? list.filter((b) => (b.aiTags || []).includes(activeTagFilter)) : list;
  if (!shown.length) {
    el.innerHTML = '<p class="empty-tip">该标签下暂无书籍。</p>';
    return;
  }

  for (const b of shown) {
    const card = document.createElement('div');
    card.className = 'book-card';
    const coverChar = (b.title || '?').trim().charAt(0) || '?';
    const tagsHtml = (b.aiTags && b.aiTags.length)
      ? `<div class="bc-tags">${b.aiTags.map((t) => `<span class="tag-chip sm">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
    const aiLabel = (b.aiTags && b.aiTags.length) ? '重做归类' : 'AI 归类';
    card.innerHTML =
      `<div class="bc-cover">${escapeHtml(coverChar)}</div>` +
      `<div class="bc-body">` +
        `<div class="bc-title">${escapeHtml(b.title)}</div>` +
        `<div class="bc-meta">${escapeHtml(b.author || '佚名')} · ${b.chaptersCount} 章</div>` +
        tagsHtml +
        `<button class="bc-ai-btn" data-ai="${b.id}">${aiLabel}</button>` +
      `</div>` +
      `<div class="bc-del" data-del="${b.id}">删除</div>`;
    card.addEventListener('click', () => openBook(b.id));
    card.querySelector('.bc-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`确定从本机删除《${b.title}》？此操作不可恢复。`)) {
        await deleteBook(b.id);
        activeTagFilter = null;
        renderShelf();
      }
    });
    const aiEl = card.querySelector('.bc-ai-btn');
    aiEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      await categorizeBook(b.id, aiEl);
    });
    el.appendChild(card);
  }
}

async function categorizeBook(id, el) {
  if (!aiConfigured()) {
    alert('请先在「阅读设置 → AI 引擎」选择「AI 大模型」并填写 API Key，才能自动归类。');
    return;
  }
  const original = el.textContent;
  el.textContent = '归类中…';
  el.classList.add('busy');
  try {
    const book = await getBook(id);
    if (!book) throw new Error('书籍数据缺失');
    const tags = await aiTags(book);
    book.ai = Object.assign({}, book.ai, { tags });
    await putBook(book);
    activeTagFilter = null;
    await renderShelf();
  } catch (e) {
    alert('AI 归类失败：' + e.message);
    el.textContent = original;
    el.classList.remove('busy');
  }
}

async function importBook(book) {
  try {
    await putBook(book);
    await renderShelf();
    maybeAutoSummary(book);
    return true;
  } catch (e) {
    alert('导入失败：' + e.message);
    return false;
  }
}

// 导入后若已配置 AI 且开启自动导读，则在后台静默生成全书导读并缓存到本书（失败不影响阅读）。
function maybeAutoSummary(book) {
  if (!settings.aiAutoSummary || !aiConfigured()) return;
  (async () => {
    try {
      const { summary, guide } = await aiSummary(book, { type: 'book' });
      book.ai = Object.assign({}, book.ai, { summary, guide });
      await putBook(book);
    } catch (e) { /* 自动生成失败静默忽略 */ }
  })();
}

// ---------- 阅读 ----------
function computeMetrics() {
  const vp = $('page-viewport');
  return { pageWidth: vp.clientWidth, pageHeight: vp.clientHeight };
}
function settingsHash() {
  return [
    settings.fontSize, settings.lineHeight, settings.margin, settings.justify,
    settings.letterSpacing, settings.paragraphSpacing, settings.firstLineIndent, settings.fontFamily,
  ].join('|');
}
function paginateCurrentChapter() {
  if (currentBook.source === 'pdf') {
    pages = [''];
    if (pi >= pages.length) pi = pages.length - 1;
    if (pi < 0) pi = 0;
    return;
  }
  const key = ci + ':' + settingsHash();
  if (pageCache.has(key)) {
    pages = pageCache.get(key);
  } else {
    const m = computeMetrics();
    pages = paginateChapter(currentBook.chapters[ci].html, m);
    pageCache.set(key, pages);
  }
  if (pi >= pages.length) pi = pages.length - 1;
  if (pi < 0) pi = 0;
}
function computeChapterChars() {
  chapterChars = currentBook.chapters.map((c) => chapterCharCount(c.html));
  totalChars = chapterChars.reduce((a, b) => a + b, 0);
}
function computeProgressPct() {
  let before = 0;
  for (let i = 0; i < ci; i++) before += chapterChars[i];
  const inCh = pages.length ? (pi / Math.max(pages.length, 1)) * (chapterChars[ci] || 0) : 0;
  return totalChars ? ((before + inCh) / totalChars) * 100 : 0;
}
async function renderPage() {
  if (currentBook.source === 'pdf') {
    const targetW = Math.min(
      Math.ceil($('page-viewport').clientWidth * (window.devicePixelRatio || 1) * 1.5),
      1600
    );
    let url = pdfImageCache.get(ci);
    if (!url) {
      try {
        const r = await renderPdfPage(currentPdfDoc, ci, targetW);
        url = r.url;
        pdfImageCache.set(ci, url);
      } catch (e) {
        $('page').innerHTML = '<p style="padding:24px">本页渲染失败：' + e.message + '</p>';
        $('chapter-title').textContent = currentBook.chapters[ci].title;
        updateProgress();
        return;
      }
    }
    $('page').innerHTML = '<div class="pdfpage"><img src="' + url + '" alt=""></div>';
    $('chapter-title').textContent = currentBook.chapters[ci].title;
    updateProgress();
    return;
  }
  $('page').innerHTML = pages[pi] || '';
  $('chapter-title').textContent = currentBook.chapters[ci].title;
  updateProgress();
}
function updateProgress() {
  const total = pages.length;
  const pct = computeProgressPct();
  $('progress').textContent = `第${ci + 1}/${currentBook.chapters.length}章 · 第${pi + 1}/${total}页 · ${pct.toFixed(0)}%`;
}
function regalFlash() {
  const r = $('reader');
  r.classList.add('regal');
  setTimeout(() => r.classList.remove('regal'), 90);
}
async function afterPageTurn(chapterChanged) {
  await renderPage();
  saveProgress(currentBook.id, ci, pi);
  turnCounter++;
  const N = settings.regalRefresh;
  if (N > 0 && ((N === 999 && chapterChanged) || (N !== 999 && turnCounter % N === 0))) {
    regalFlash();
  }
}
async function nextPage() {
  hideTranslate();
  if (pi < pages.length - 1) {
    pi++;
    await afterPageTurn(false);
  } else if (ci < currentBook.chapters.length - 1) {
    ci++; pi = 0;
    paginateCurrentChapter();
    await afterPageTurn(true);
  }
}
async function prevPage() {
  hideTranslate();
  if (pi > 0) {
    pi--;
    await afterPageTurn(false);
  } else if (ci > 0) {
    ci--;
    paginateCurrentChapter();
    pi = pages.length - 1;
    await afterPageTurn(true);
  }
}

async function openBook(id) {
  const book = await getBook(id);
  if (!book) { alert('书籍数据缺失，可能已被删除。'); return; }
  currentBook = book;
  ci = 0; pi = 0; pageCache.clear(); turnCounter = 0; pdfImageCache.clear();
  const prog = getProgress(id);
  if (prog) {
    ci = Math.min(prog.ci || 0, book.chapters.length - 1);
    pi = prog.pi || 0;
  }
  if (book.source === 'pdf') {
    try {
      currentPdfDoc = await openPdf(book.pdfBytes);
    } catch (e) {
      alert('PDF 打开失败：' + e.message);
      return;
    }
    chapterChars = book.chapters.map(() => 1);
    totalChars = chapterChars.length;
    pages = [''];
  } else {
    currentPdfDoc = null;
    computeChapterChars();
  }
  $('shelf').classList.add('hidden');
  $('reader').classList.remove('hidden');
  $('reader').classList.add('hide-chrome');
  closePanels();
  // 必须在阅读器可见后再分页：hidden 状态下 #page-viewport 高度为 0，会触发“每页 1 字”极端分支
  if (!currentPdfDoc) {
    paginateCurrentChapter();
  }
  await renderPage();
  buildToc();
  buildBookmarks();
}
function backToShelf() {
  hideTranslate();
  if (currentPdfDoc) {
    try { currentPdfDoc.destroy(); } catch (e) {}
    currentPdfDoc = null;
    pdfImageCache.clear();
  }
  $('reader').classList.add('hidden');
  $('shelf').classList.remove('hidden');
  currentBook = null;
  renderShelf();
}

// ---------- 面板 ----------
function openPanel(id) {
  hideTranslate();
  closePanels();
  $(id).classList.add('open');
  $('panel-mask').classList.add('open');
}
function closePanels() {
  document.querySelectorAll('.panel.open').forEach((p) => p.classList.remove('open'));
  $('panel-mask').classList.remove('open');
}

// ---------- 选中文字翻译 ----------
let lastSelText = '';
function hideTranslate() {
  $('sel-bar').classList.add('hidden');
  $('translate-pop').classList.add('hidden');
  $('ai-explain-pop').classList.add('hidden');
}
function translateProviderLabel(p) {
  return ({ none: '关闭', mock: '演示', deepl: 'DeepL', google: 'Google', llm: 'AI' })[p] || p;
}
function updateTranslateFieldsVisibility() {
  const p = settings.translateProvider;
  const showKey = p === 'deepl' || p === 'google' || p === 'llm';
  const showBase = p === 'llm';
  $('field-tkey').style.display = showKey ? '' : 'none';
  $('field-tbase').style.display = showBase ? '' : 'none';
}
function selectionRect() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;
  return rect;
}
function showSelBar(rect) {
  const bar = $('sel-bar');
  const r = $('reader').getBoundingClientRect();
  // 固定在底部居中、刚好在底栏之上，避免压住选中文字（墨水屏上压字尤其碍眼）
  bar.style.top = '';
  bar.style.bottom = '52px';
  bar.style.left = Math.max(8, r.width / 2 - bar.offsetWidth / 2) + 'px';
  bar.classList.remove('hidden');
}
function onSelectEnd() {
  const pop = $('translate-pop');
  const epop = $('ai-explain-pop');
  if (!pop.classList.contains('hidden') || !epop.classList.contains('hidden')) return; // 弹层开着时不抢焦点
  if ($('reader').classList.contains('hidden')) { hideTranslate(); return; }
  const t = (window.getSelection() && window.getSelection().toString().trim()) || '';
  if (!t) { hideTranslate(); lastSelText = ''; return; }
  lastSelText = t;
  const rect = selectionRect();
  if (!rect) { hideTranslate(); return; }
  showSelBar(rect);
}
async function doTranslate(text) {
  const pop = $('translate-pop');
  $('sel-bar').classList.add('hidden');
  pop.classList.remove('hidden');
  $('translate-dir').textContent = '翻译中…';
  $('translate-result').textContent = '';
  $('translate-swap').classList.add('hidden');
  $('translate-copy').classList.add('hidden');
  const opts = {
    provider: settings.translateProvider,
    apiKey: settings.translateApiKey,
    llmBaseUrl: settings.translateLlmBase,
    llmModel: settings.translateLlmModel,
    dir: settings.translateDir,
  };
  try {
    const res = await translateText(text, opts);
    $('translate-dir').textContent =
      (res.from === 'zh' ? '中' : '英') + ' → ' + (res.to === 'zh' ? '中' : '英') + ' · ' + translateProviderLabel(res.provider);
    $('translate-result').textContent = res.text;
    $('translate-swap').classList.remove('hidden');
    $('translate-copy').classList.remove('hidden');
  } catch (e) {
    $('translate-dir').textContent = '翻译失败';
    $('translate-result').textContent = e.message;
  }
}
function initTranslateSelection() {
  document.addEventListener('mouseup', () => setTimeout(onSelectEnd, 0));
  document.addEventListener('touchend', () => setTimeout(onSelectEnd, 0));
  $('sel-translate').addEventListener('click', () => { if (lastSelText) doTranslate(lastSelText); });
  $('sel-ai').addEventListener('click', () => { if (lastSelText) doExplain(lastSelText); });
  $('translate-close').addEventListener('click', hideTranslate);
  $('ai-explain-close').addEventListener('click', hideTranslate);
  $('translate-copy').addEventListener('click', () => {
    const t = $('translate-result').textContent;
    if (t && navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {});
  });
  $('translate-swap').addEventListener('click', () => {
    const t = $('translate-result').textContent;
    if (t) doTranslate(t); // 对译文再译一次（自动识别语言即反向）
  });
}

// 选中即问：调用 AI 解释选中内容，结果展示在独立弹层
async function doExplain(text) {
  const pop = $('ai-explain-pop');
  $('sel-bar').classList.add('hidden');
  if (!aiConfigured()) {
    pop.classList.remove('hidden');
    $('ai-explain-text').innerHTML =
      '<p class="empty-tip">尚未配置 AI 引擎。请到「阅读设置 → AI 引擎」选择「AI 大模型」并填写 API Key。</p>';
    return;
  }
  pop.classList.remove('hidden');
  $('ai-explain-text').textContent = 'AI 思考中…';
  try {
    const ctx = currentBook ? await buildBookContext(currentBook, 2500) : '';
    const out = await aiExplain(text, currentBook, ctx);
    $('ai-explain-text').textContent = out;
  } catch (e) {
    $('ai-explain-text').textContent = e.message;
  }
}

// 取书籍摘要文本作为解释/问答的上下文（复用 ai.js 的 buildDigest 思路，这里轻量实现避免循环依赖）
async function buildBookContext(book, budget) {
  const titles = book.chapters.map((c) => c.title || '').filter(Boolean).join(' / ');
  let text = '';
  for (const ch of book.chapters) {
    if (text.length >= budget) break;
    const d = document.createElement('div');
    d.innerHTML = ch.html || '';
    const t = (d.textContent || '').replace(/\s+/g, ' ').trim();
    text += (text ? '\n' : '') + (ch.title ? '【' + ch.title + '】' : '') + t.slice(0, Math.max(0, budget - text.length - 40));
  }
  return '目录：' + titles + '\n\n正文摘录：\n' + text;
}
function buildToc() {
  const list = $('toc-list');
  list.innerHTML = '';
  currentBook.chapters.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'toc-item' + (i === ci ? ' active' : '');
    d.textContent = c.title;
    d.addEventListener('click', () => {
      ci = i; pi = 0;
      paginateCurrentChapter();
      closePanels();
      afterPageTurn(true);
    });
    list.appendChild(d);
  });
}
function buildBookmarks() {
  const map = loadBookmarks();
  const list = map[currentBook.id] || [];
  const el = $('bookmark-list');
  el.innerHTML = '';
  if (!list.length) {
    el.innerHTML = '<p class="empty-tip">暂无书签。点上方「标记当前页」记录此处。</p>';
    return;
  }
  list.forEach((bm, idx) => {
    const d = document.createElement('div');
    d.className = 'bm-item';
    d.innerHTML = `<span>${escapeHtml(bm.label)}</span><span class="bm-del" data-i="${idx}">删</span>`;
    d.addEventListener('click', (e) => {
      if (e.target.dataset.i !== undefined) return;
      ci = bm.ci; pi = bm.pi;
      paginateCurrentChapter();
      closePanels();
      afterPageTurn(true);
    });
    d.querySelector('.bm-del').addEventListener('click', (e) => {
      e.stopPropagation();
      const m = loadBookmarks();
      (m[currentBook.id] || []).splice(idx, 1);
      saveBookmarks(m);
      buildBookmarks();
    });
    el.appendChild(d);
  });
}
function addBookmark() {
  const m = loadBookmarks();
  if (!m[currentBook.id]) m[currentBook.id] = [];
  const label = `第${ci + 1}章 · 第${pi + 1}页`;
  m[currentBook.id].push({ ci, pi, label, at: Date.now() });
  saveBookmarks(m);
  buildBookmarks();
}

// ---------- AI 面板逻辑 ----------
function loadCachedGuide() {
  if (!currentBook) return;
  const ai = currentBook.ai || {};
  const out = $('ai-guide-out');
  if (ai.summary || ai.guide) {
    out.innerHTML = renderMarkdown(
      (ai.summary ? '## 内容概要\n' + ai.summary + '\n\n' : '') + (ai.guide || '')
    );
  } else {
    out.innerHTML = '<p class="empty-tip">本书暂无导读。点上方按钮生成（需配置 AI 引擎）。</p>';
  }
}

async function genGuide(scopeType) {
  if (!currentBook) return;
  if (!aiConfigured()) { alert('请先在「阅读设置 → AI 引擎」选择「AI 大模型」并填写 API Key。'); return; }
  const out = $('ai-guide-out');
  const btn = scopeType === 'chapter' ? $('ai-gen-guide-ch') : $('ai-gen-guide');
  const prev = btn.textContent;
  btn.textContent = '生成中…'; btn.disabled = true;
  out.innerHTML = '<p class="empty-tip">AI 生成中…</p>';
  try {
    const scope = scopeType === 'chapter' ? { type: 'chapter', index: ci } : { type: 'book' };
    const r = await aiSummary(currentBook, scope);
    if (scopeType === 'book') {
      currentBook.ai = Object.assign({}, currentBook.ai, { summary: r.summary, guide: r.guide });
      await putBook(currentBook);
    }
    const body = (scopeType === 'book' && r.summary ? '## 内容概要\n' + r.summary + '\n\n' : '') + r.guide;
    out.innerHTML = renderMarkdown(body);
  } catch (e) {
    out.innerHTML = '<p class="empty-tip">生成失败：' + e.message + '</p>';
  } finally {
    btn.textContent = prev; btn.disabled = false;
  }
}

async function askQuestion() {
  if (!currentBook) return;
  const q = $('ai-qa-question').value.trim();
  if (!q) { alert('请输入你的问题'); return; }
  if (!aiConfigured()) { alert('请先在「阅读设置 → AI 引擎」选择「AI 大模型」并填写 API Key。'); return; }
  const out = $('ai-qa-out');
  const item = document.createElement('div');
  item.className = 'qa-item';
  item.innerHTML = '<div class="qa-q">' + escapeHtml(q) + '</div><div class="qa-a">AI 思考中…</div>';
  out.prepend(item);
  const aEl = item.querySelector('.qa-a');
  try {
    const ans = await aiAsk(q, currentBook);
    aEl.innerHTML = renderMarkdown(ans);
    currentBook.ai = Object.assign({}, currentBook.ai, {
      qa: (currentBook.ai && currentBook.ai.qa ? currentBook.ai.qa : []).concat([{ q, a: ans }]),
    });
    await putBook(currentBook);
  } catch (e) {
    aEl.textContent = '失败：' + e.message;
  }
}

async function genNotes() {
  if (!currentBook) return;
  if (!aiConfigured()) { alert('请先在「阅读设置 → AI 引擎」选择「AI 大模型」并填写 API Key。'); return; }
  const out = $('ai-notes-out');
  out.innerHTML = '<p class="empty-tip">AI 生成中…</p>';
  try {
    const n = await aiNotes(currentBook);
    currentBook.ai = Object.assign({}, currentBook.ai, { notes: n });
    await putBook(currentBook);
    out.innerHTML = renderNotes(n);
  } catch (e) {
    out.innerHTML = '<p class="empty-tip">生成失败：' + e.message + '</p>';
  }
}
function renderNotes(n) {
  let h = '';
  if (n.characters && n.characters.length) {
    h += '<h4>人物 / 实体</h4><div class="note-cards">';
    n.characters.forEach((c) => {
      h += '<div class="note-card"><div class="nc-title">' + escapeHtml(c.name || '') + '</div>' +
        (c.role ? '<div class="nc-role">' + escapeHtml(c.role) + '</div>' : '') +
        (c.relation ? '<div class="nc-rel">' + escapeHtml(c.relation) + '</div>' : '') + '</div>';
    });
    h += '</div>';
  }
  if (n.timeline && n.timeline.length) {
    h += '<h4>关键脉络</h4><ul class="note-list">';
    n.timeline.forEach((t) => { h += '<li><b>' + escapeHtml(t.point || '') + '</b> ' + escapeHtml(t.desc || '') + '</li>'; });
    h += '</ul>';
  }
  if (n.points && n.points.length) {
    h += '<h4>核心要点</h4><ul class="note-list">';
    n.points.forEach((p) => { h += '<li>' + escapeHtml(p) + '</li>'; });
    h += '</ul>';
  }
  return h || '<p class="empty-tip">未能生成笔记。</p>';
}

async function genBilingual() {
  if (!currentBook) return;
  if (settings.translateProvider === 'none') {
    alert('请先在「AI 引擎」选择翻译引擎（演示 / DeepL / Google / AI 大模型）。');
    return;
  }
  const out = $('ai-bilingual-out');
  out.innerHTML = '<p class="empty-tip">逐段翻译中…</p>';
  try {
    const paras = pageParagraphs(pages[pi] || '');
    const rows = await aiBilingual(paras, settings.translateDir);
    let h = '';
    rows.forEach((r) => {
      h += '<div class="bi-row"><div class="bi-orig">' + escapeHtml(r.orig) + '</div>' +
        (r.trans ? '<div class="bi-trans">' + escapeHtml(r.trans) + '</div>' : '') + '</div>';
    });
    out.innerHTML = h || '<p class="empty-tip">本页无可翻译内容。</p>';
  } catch (e) {
    out.innerHTML = '<p class="empty-tip">双语生成失败：' + e.message + '</p>';
  }
}

// ---------- 设置变更 ----------
function onSettingChange() {
  saveSettings(settings);
  if (currentBook && currentBook.source !== 'pdf') paginateCurrentChapter();
  renderPage();
}
function scheduleRepaginate() {
  clearTimeout(repTimer);
  repTimer = setTimeout(() => {
    if (currentBook && currentBook.source !== 'pdf') { paginateCurrentChapter(); renderPage(); }
  }, 120);
}

// ---------- 事件绑定 ----------
function bindEvents() {
  // 导入
  $('import-txt').addEventListener('click', () => $('file-txt').click());
  $('import-epub').addEventListener('click', () => $('file-epub').click());
  $('import-pdf').addEventListener('click', () => $('file-pdf').click());
  $('file-txt').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    await importBook(await parseTxt(f));
    e.target.value = '';
  });
  $('file-epub').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const book = await parseEpub(f);
      await importBook(book);
    } catch (err) {
      alert('EPUB 导入失败：' + err.message);
    }
    e.target.value = '';
  });
  $('file-pdf').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const book = await parsePdf(f);
      await importBook(book);
    } catch (err) {
      alert('PDF 导入失败：' + err.message);
    }
    e.target.value = '';
  });
  $('import-mobi').addEventListener('click', () => $('file-mobi').click());
  $('file-mobi').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const book = await parseMobi(f);
      await importBook(book);
    } catch (err) {
      alert('MOBI 导入失败：' + err.message);
    }
    e.target.value = '';
  });
  $('open-sample').addEventListener('click', async () => {
    await putBook(SAMPLE_BOOK);
    await openBook(SAMPLE_BOOK.id);
  });

  // 拖拽导入
  const shelf = $('shelf');
  const hint = $('drop-hint');
  ['dragenter', 'dragover'].forEach((ev) =>
    shelf.addEventListener(ev, (e) => { e.preventDefault(); hint.classList.add('over'); })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    shelf.addEventListener(ev, (e) => { e.preventDefault(); hint.classList.remove('over'); })
  );
  shelf.addEventListener('drop', async (e) => {
    const files = e.dataTransfer.files;
    for (const f of files) {
      if (KINDLE_RE.test(f.name)) {
        alert(
          '暂不支持该 Kindle 格式：' + f.name + '\n\n' +
          'Kindle 的 .azw3 / .kfx 多为加密或 KF8 复杂结构，浏览器内无法可靠解析。\n\n' +
          '最简单：用免费软件 Calibre 一键转成 EPUB 再导入本阅读器——\n' +
          '  1) 打开 Calibre，把这本书拖进去；\n' +
          '  2) 选中它 → 顶部「转换书籍」→ 右上角输出格式选 EPUB → 确定；\n' +
          '  3) 右键该书 → 打开所在目录，取出 .epub 拖进本阅读器即可。\n\n' +
          '（普通 .mobi / .azw 已支持应用内直接导入，无需转换。）'
        );
        continue;
      }
      if (/\.mobi$/i.test(f.name) || /\.azw$/i.test(f.name)) {
        try { await importBook(await parseMobi(f)); } catch (err) { alert('MOBI 导入失败：' + err.message); }
      } else if (/\.txt$/i.test(f.name)) await importBook(await parseTxt(f));
      else if (/\.epub$/i.test(f.name)) {
        try { await importBook(await parseEpub(f)); } catch (err) { alert('EPUB 导入失败：' + err.message); }
      } else if (/\.pdf$/i.test(f.name)) {
        try { await importBook(await parsePdf(f)); } catch (err) { alert('PDF 导入失败：' + err.message); }
      } else {
        alert('不支持的格式：' + f.name + '\n目前支持 .txt / .epub / .pdf / .mobi / .azw（AZW3/KFX 请用 Calibre 转 EPUB）。');
      }
    }
  });

  // 阅读器导航
  $('btn-back').addEventListener('click', backToShelf);
  $('btn-prev').addEventListener('click', prevPage);
  $('btn-next').addEventListener('click', nextPage);
  $('btn-toc').addEventListener('click', () => openPanel('panel-toc'));
  $('btn-toc-top').addEventListener('click', () => openPanel('panel-toc'));
  $('btn-bookmark').addEventListener('click', () => { buildBookmarks(); openPanel('panel-bookmark'); });
  $('btn-ai').addEventListener('click', () => { openPanel('panel-ai'); loadCachedGuide(); });
  $('btn-settings').addEventListener('click', () => openPanel('panel-settings'));
  $('bm-add').addEventListener('click', addBookmark);

  // AI 面板：tab 切换
  document.querySelectorAll('.ai-tab').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.ai-tab').forEach((x) => x.classList.toggle('active', x === b));
      document.querySelectorAll('.ai-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== b.dataset.aiTab));
    });
  });
  $('ai-gen-guide').addEventListener('click', () => genGuide('book'));
  $('ai-gen-guide-ch').addEventListener('click', () => genGuide('chapter'));
  $('ai-qa-ask').addEventListener('click', askQuestion);
  $('ai-gen-notes').addEventListener('click', genNotes);
  $('ai-bilingual-gen').addEventListener('click', genBilingual);
  $('panel-mask').addEventListener('click', closePanels);
  document.querySelectorAll('.panel-close').forEach((b) =>
    b.addEventListener('click', closePanels)
  );

  // 点击翻页区：左/右/中
  $('page-viewport').addEventListener('click', (e) => {
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return; // 选中文字时不翻页
    if (document.querySelector('.panel.open')) { closePanels(); return; }
    if (!$('reader').classList.contains('hide-chrome')) {
      $('reader').classList.add('hide-chrome'); // 显示栏时，点击任意处收起
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const r = x / rect.width;
    if (r < 0.3) prevPage();
    else if (r > 0.7) nextPage();
    else $('reader').classList.remove('hide-chrome');
  });

  // 设置控件
  $('seg-theme').addEventListener('click', (e) => {
    const v = e.target.dataset.val; if (!v) return;
    settings.theme = v; applySettings(); saveSettings(settings);
  });
  $('seg-font').addEventListener('click', (e) => {
    const v = e.target.dataset.val; if (!v) return;
    settings.fontFamily = v; applySettings(); saveSettings(settings); scheduleRepaginate();
  });
  $('seg-regal').addEventListener('click', (e) => {
    const v = e.target.dataset.val; if (!v) return;
    settings.regalRefresh = parseInt(v, 10); applySettings(); saveSettings(settings);
  });
  const bindRange = (id, key, parse, label) => {
    $(id).addEventListener('input', (e) => {
      settings[key] = parse(e.target.value);
      if (label) label(settings[key]);
      applySettings();
      saveSettings(settings);
      scheduleRepaginate();
    });
  };
  bindRange('set-fontsize', 'fontSize', (v) => parseInt(v, 10), (v) => ($('val-fontsize').textContent = v + 'px'));
  bindRange('set-lineheight', 'lineHeight', (v) => parseFloat(v), (v) => ($('val-lineheight').textContent = v.toFixed(2)));
  bindRange('set-margin', 'margin', (v) => parseInt(v, 10), (v) => ($('val-margin').textContent = v + 'px'));
  bindRange('set-paraspacing', 'paragraphSpacing', (v) => parseFloat(v), (v) => ($('val-paraspacing').textContent = v.toFixed(1) + 'em'));
  bindRange('set-letterspacing', 'letterSpacing', (v) => parseFloat(v), (v) => ($('val-letterspacing').textContent = v + 'px'));
  $('set-justify').addEventListener('change', (e) => { settings.justify = e.target.checked; applySettings(); saveSettings(settings); scheduleRepaginate(); });
  $('set-indent').addEventListener('change', (e) => { settings.firstLineIndent = e.target.checked; applySettings(); saveSettings(settings); scheduleRepaginate(); });

  // 翻译设置
  $('seg-translate-provider').addEventListener('click', (e) => {
    const v = e.target.dataset.val; if (!v) return;
    settings.translateProvider = v; saveSettings(settings);
    setSeg('seg-translate-provider', v); updateTranslateFieldsVisibility();
  });
  $('set-tkey').addEventListener('input', (e) => { settings.translateApiKey = e.target.value; saveSettings(settings); });
  $('set-tbase').addEventListener('input', (e) => { settings.translateLlmBase = e.target.value; saveSettings(settings); });
  $('set-tmodel').addEventListener('input', (e) => { settings.translateLlmModel = e.target.value; saveSettings(settings); });
  $('seg-tdir').addEventListener('click', (e) => {
    const v = e.target.dataset.val; if (!v) return;
    settings.translateDir = v; saveSettings(settings); setSeg('seg-tdir', v);
  });
  $('set-ai-auto').addEventListener('change', (e) => {
    settings.aiAutoSummary = e.target.checked; saveSettings(settings);
  });
  initTranslateSelection();

  // 键盘（桌面）
  document.addEventListener('keydown', (e) => {
    if ($('reader').classList.contains('hidden')) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nextPage(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prevPage(); }
    else if (e.key === 'Escape') closePanels();
  });

  // 窗口尺寸变化 -> 重新分页
  let rz = null;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (currentBook && !$('reader').classList.contains('hidden')) {
        if (currentBook.source === 'pdf') pdfImageCache.clear();
        paginateCurrentChapter();
        renderPage();
      }
    }, 200);
  });
}

// ---------- 启动 ----------
function init() {
  applySettings();
  bindEvents();
  renderShelf();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
