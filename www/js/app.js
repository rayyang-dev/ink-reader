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

async function renderShelf() {
  const list = await listBooksMeta();
  const el = $('book-list');
  el.innerHTML = '';
  if (!list.length) {
    el.innerHTML = '<p class="empty-tip">还没有书。点上方按钮导入 TXT / EPUB，或先「读示例书」体验。</p>';
    return;
  }
  for (const b of list) {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.innerHTML =
      `<div class="bc-title">${escapeHtml(b.title)}</div>` +
      `<div class="bc-meta">${escapeHtml(b.author || '佚名')} · ${b.chaptersCount} 章</div>` +
      `<div class="bc-del" data-del="${b.id}">删除</div>`;
    card.addEventListener('click', () => openBook(b.id));
    card.querySelector('.bc-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`确定从本机删除《${b.title}》？此操作不可恢复。`)) {
        await deleteBook(b.id);
        renderShelf();
      }
    });
    el.appendChild(card);
  }
}

async function importBook(book) {
  try {
    await putBook(book);
    await renderShelf();
    return true;
  } catch (e) {
    alert('导入失败：' + e.message);
    return false;
  }
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
  $('progress').textContent = `第${ci + 1}/${currentBook.chapters.length}章 · ${pi + 1}/${total} · 约${pct.toFixed(0)}%`;
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
  $('translate-fab').classList.add('hidden');
  $('translate-pop').classList.add('hidden');
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
function showTranslateFab(rect) {
  const fab = $('translate-fab');
  const r = $('reader').getBoundingClientRect();
  let left = rect.left - r.left + rect.width / 2 - 18;
  let top = rect.top - r.top - 34;
  if (top < 44) top = rect.bottom - r.top + 8;
  fab.style.left = Math.max(8, left) + 'px';
  fab.style.top = Math.max(44, top) + 'px';
  fab.classList.remove('hidden');
}
function onSelectEnd() {
  const pop = $('translate-pop');
  if (!pop.classList.contains('hidden')) return; // 弹层开着时不抢焦点
  if ($('reader').classList.contains('hidden')) { hideTranslate(); return; }
  const t = (window.getSelection() && window.getSelection().toString().trim()) || '';
  if (!t) { hideTranslate(); lastSelText = ''; return; }
  lastSelText = t;
  const rect = selectionRect();
  if (!rect) { hideTranslate(); return; }
  pop.classList.add('hidden');
  showTranslateFab(rect);
}
async function doTranslate(text) {
  const pop = $('translate-pop');
  pop.classList.remove('hidden');
  $('translate-dir').textContent = '翻译中…';
  $('translate-result').textContent = '';
  $('translate-swap').classList.add('hidden');
  $('translate-copy').classList.add('hidden');
  $('translate-fab').classList.add('hidden');
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
  $('translate-fab').addEventListener('click', () => { if (lastSelText) doTranslate(lastSelText); });
  $('translate-close').addEventListener('click', hideTranslate);
  $('translate-copy').addEventListener('click', () => {
    const t = $('translate-result').textContent;
    if (t && navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {});
  });
  $('translate-swap').addEventListener('click', () => {
    const t = $('translate-result').textContent;
    if (t) doTranslate(t); // 对译文再译一次（自动识别语言即反向）
  });
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
  $('btn-settings').addEventListener('click', () => openPanel('panel-settings'));
  $('bm-add').addEventListener('click', addBookmark);
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
