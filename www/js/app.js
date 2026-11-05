// 水杉阅读 —— 主控逻辑
import {
  loadSettings, saveSettings, DEFAULT_SETTINGS,
  putBook, getBook, deleteBook, listBooksMeta, getAllBooks,
  loadProgress, saveProgress, getProgress,
  loadBookmarks, saveBookmarks,
  addReadingTime, aggregateStats, loadStats, todayKey,
} from './store.js';
import { paginateChapter, chapterCharCount } from './paginate.js';
import { parseTxt, parseEpub, parsePdf, parseMobi, parseFb2, parseHtml, parseDocx } from './importers.js';
import { openPdf, renderPdfPage } from './pdfview.js';
import { translateText } from './translate.js';
import {
  aiConfigured, aiSummary, aiExplain, aiAsk, aiNotes, aiBilingual, pageParagraphs, renderMarkdown,
} from './ai.js';

// Capacitor 仅存在于原生外壳（Android WebView），由桥接层把插件挂在全局 window.Capacitor.Plugins 上。
// 本项目 www/ 未打包，浏览器 / PWA 环境没有运行时、也没有 importmap，若用裸模块导入
// '@capacitor/app' 会在模块求值阶段抛 “Failed to resolve module specifier” 导致整个 app.js
// 不执行、所有按钮失活。因此直接读取 window.Capacitor.Plugins.App：原生环境正常挂载原生能力，
// 非原生环境（纯浏览器 / 本地预览）安全置空、跳过即可，绝不影响核心阅读功能。
// Capacitor 仅存在于原生外壳（Android WebView），由桥接层把插件挂在全局 window.Capacitor.Plugins 上。
// 本项目 www/ 未打包，浏览器 / PWA 环境没有运行时、也没有 importmap，若用裸模块导入
// '@capacitor/app' 会在模块求值阶段抛 “Failed to resolve module specifier” 导致整个 app.js
// 不执行、所有按钮失活。因此直接读取 window.Capacitor.Plugins.App 并提供懒解析：原生环境正常
// 挂载原生能力、非原生环境（纯浏览器 / 本地预览）安全返回 null、跳过即可，绝不影响核心阅读功能。
function capacitorApp() {
  try {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) || null;
  } catch (e) {
    return null;
  }
}

const FONT_STACK = {
  serif: 'Georgia, "Songti SC", "Noto Serif SC", "Source Han Serif SC", serif',
  sans: '-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  mono: '"Courier New", "Noto Sans Mono", monospace',
};

// 主题皮肤（顺序即设置页色板顺序）；THEME_PREVIEW 仅用于色板预览的 bg/fg
// 仅保留 2 套：墨水风(宣纸底·笔迹淡化翻页) / 简约(米白底·整页水平滑动)
const THEMES = [
  { id: 'ink', name: '墨水风' },
  { id: 'simple', name: '简约' },
];
const THEME_PREVIEW = {
  ink: ['#fefdfb', '#202b31'], simple: ['#f7f6f2', '#1f1f1f'],
};

// 法律声明文案（隐私政策 / 用户协议 / 权限说明）。iOS 与华为两平台通用，纯本地静态内容，无服务器依赖。
// 联系邮箱、生效日期等需按实际情况替换（下方以占位给出）。
const LEGAL_EFFECTIVE_DATE = '2026-11-04';
const LEGAL_CONTACT_EMAIL = 'metasequoia-dev@example.com'; // 待你替换为真实联系邮箱
const LEGAL_CONTENT = {
  privacy: {
    title: '隐私政策',
    html: `
      <p>生效日期：${LEGAL_EFFECTIVE_DATE}</p>
      <p>水杉阅读（以下简称"本应用"）是一款<b>本地优先</b>的电子书阅读器。我们极其重视你的隐私，并遵循"数据最小化"原则。本政策说明我们如何处理信息。</p>
      <h2>一、我们收集的信息</h2>
      <p>本应用默认完全在你的设备本地运行，<b>不要求注册账号</b>，不收集任何个人信息即可使用核心阅读功能。保存在你设备上的数据仅包括：导入的书籍文件、阅读进度与书签、排版与主题等设置，以及在你主动启用 AI 功能时保存的第三方 API Key（仅存本机）。这些数据均保存在你的设备本地存储/应用沙盒中，<b>不会自动上传到任何服务器</b>（本应用没有后端服务器）。</p>
      <h2>二、AI 与联网功能</h2>
      <p>当你主动开启"AI 引擎"或"翻译"并填入第三方提供方的 API Key 后，阅读页的"译 / AI 解释"、AI 助手（导读 / 问答 / 笔记 / 双语对照）会将你选中的文本或本书内容发送给你所配置的大模型 / 翻译服务（如 DeepL、Google、OpenAI 及兼容接口）。这些数据由对应第三方按其各自隐私政策处理，传输与存储责任由该提供方承担。你随时可在设置中关闭 AI 功能并清除 Key，关闭后相关联网行为即停止。</p>
      <h2>三、网络权限</h2>
      <p>本应用申请"网络"权限，仅用于上述 AI / 翻译请求以及极少量的版本检查；书籍导入、阅读、笔记均不依赖网络。</p>
      <h2>四、我们不会出售或共享你的个人信息</h2>
      <p>除法律法规要求或你主动开启的第三方服务外，我们不会向任何第三方披露、出售或交易你的数据。</p>
      <h2>五、儿童隐私</h2>
      <p>本应用不专门面向未满 14 周岁的儿童，我们不会有意收集儿童个人信息。</p>
      <h2>六、你的权利</h2>
      <p>你可以随时通过卸载应用，或在系统设置中清除应用数据，来删除全部本地数据。</p>
      <h2>七、政策变更</h2>
      <p>如本政策发生变更，我们将在应用内更新并以最新版本为准。</p>
      <h2>八、联系我们</h2>
      <p>如你对隐私事宜有疑问，可通过邮箱 ${LEGAL_CONTACT_EMAIL} 联系我们。</p>
    `,
  },
  terms: {
    title: '用户协议',
    html: `
      <p>生效日期：${LEGAL_EFFECTIVE_DATE}</p>
      <p>欢迎使用水杉阅读。使用本应用即表示你同意以下条款。</p>
      <h2>一、软件许可</h2>
      <p>在遵守本协议的前提下，我们授予你一项<b>非独占、可撤销</b>的有限许可，允许你在自有设备上为个人非商业目的安装与使用本应用。</p>
      <h2>二、使用规范</h2>
      <ul>
        <li>不得利用本应用从事任何违反法律法规的活动；</li>
        <li>你导入的书籍应保证拥有合法授权，因内容版权产生的责任由你自行承担；</li>
        <li>不得对本应用进行反向工程、反编译或试图提取源代码（法律允许的情形除外）。</li>
      </ul>
      <h2>三、知识产权</h2>
      <p>本应用软件的著作权归开发者所有；应用内所展示的书籍内容版权归原作者或出版方所有，本应用不因此获得任何内容授权。</p>
      <h2>四、AI 内容免责</h2>
      <p>AI 生成内容由第三方模型产生，仅供参考，不构成专业建议；其准确性、完整性由提供方负责，使用者应自行判断并自负其责。</p>
      <h2>五、免责声明</h2>
      <p>本应用"按现状"提供，不保证无中断、无错误或永久可用。因使用或无法使用本应用而产生的风险与损失，由你自行承担。</p>
      <h2>六、协议终止</h2>
      <p>如你违反本协议，开发者有权终止对你的许可；终止后你应停止使用并删除本应用。</p>
      <h2>七、适用法律</h2>
      <p>本协议的订立、效力与争议解决均适用中华人民共和国法律。</p>
    `,
  },
  permissions: {
    title: '权限说明',
    html: `
      <p>本应用以本地阅读为核心，遵循"权限最小化"原则，尽可能少地申请系统权限。</p>
      <h2>Android</h2>
      <ul>
        <li><b>网络（INTERNET）</b>：仅用于 AI / 翻译请求与版本检查，不用于收集个人数据；关闭 AI 功能后基本不触发联网。</li>
        <li><b>文件访问</b>：书籍导入通过系统文件选择器（SAF）完成，本应用<b>不申请</b>存储读写权限，无法在未经你主动选择文件的情况下访问设备上的其他文件。</li>
      </ul>
      <h2>iOS（如后续版本上架）</h2>
      <ul>
        <li><b>网络</b>：同上，用于 AI / 翻译与版本检查。</li>
        <li><b>文件</b>：通过系统"文件 / 文档"选择器导入，不额外申请相册、通讯录、定位等敏感权限。</li>
      </ul>
      <h2>我们不申请的权限</h2>
      <p>本应用不申请相机、定位、通讯录、麦克风、电话、短信等敏感权限；所有核心阅读与笔记功能均可在不授权任何敏感权限的情况下离线使用。</p>
    `,
  },
};

// ---------- 状态 ----------
let settings = loadSettings();
// 主题仅保留 ink / simple（竹简已移除）；旧版本残留的 theme 值统一回退到默认墨水风
if (!THEMES.some((t) => t.id === settings.theme)) {
  settings.theme = DEFAULT_SETTINGS.theme;
  saveSettings(settings);
}
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
let readingTimer = null; // 阅读计时器
let readingLastTs = 0; // 上一次计时戳
let toastTimer = null;
let isFlipping = false; // 翻页动画进行中，用于忽略重叠点击
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
  renderThemeSwatches();
  setSeg('seg-font', settings.fontFamily);
  setSeg('seg-regal', String(settings.regalRefresh));
  $('set-flip').checked = !!settings.pageFlip;
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
  $('set-checkin').value = settings.checkinGoalMin;
  $('val-checkin').textContent = settings.checkinGoalMin + ' 分钟';
  $('set-group-cat').checked = !!settings.shelfGroupByCat;
  renderCatManager();
  updateTranslateFieldsVisibility();
}

function setSeg(id, val) {
  $(id).querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.val === String(val));
  });
}

// 主题皮肤色板：渲染为「色块 + 名称」，点击即切换并落地到设置
function renderThemeSwatches() {
  const wrap = $('theme-swatches');
  if (!wrap) return;
  wrap.innerHTML = '';
  THEMES.forEach((t) => {
    const prev = THEME_PREVIEW[t.id] || ['#ccc', '#333'];
    const btn = document.createElement('button');
    btn.className = 'swatch' + (settings.theme === t.id ? ' active' : '');
    btn.dataset.val = t.id;
    const chip = document.createElement('span');
    chip.className = 'sw-chip';
    chip.style.background = prev[0];
    chip.style.borderColor = settings.theme === t.id ? 'var(--accent)' : prev[1];
    const name = document.createElement('span');
    name.className = 'sw-name';
    name.textContent = t.name;
    btn.appendChild(chip);
    btn.appendChild(name);
    btn.addEventListener('click', () => {
      settings.theme = t.id;
      applySettings();
      saveSettings(settings);
      renderThemeSwatches();
    });
    wrap.appendChild(btn);
  });
}

// ---------- 书架 ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let activeCategory = null; // null = 全部

// 书名关键词粗分类：按优先级（政治 > 历史 > 文学 > 小说）匹配，未命中归「其他」
const CATEGORY_RULES = [
  { cat: '政治', keys: ['政治', '政府', '国家', '制度', '革命', '政策', '民主', '政党', '领袖', '外交', '马克思', '毛泽东', '邓小平', '共和国', '宪政', '资本论', '体制', '政权', '改革', '法治', '列强'] },
  { cat: '历史', keys: ['历史', '史', '朝代', '古代', '近代', '民国', '史记', '通鉴', '文明', '王朝', '帝国', '战国', '秦汉', '唐', '宋', '明', '清', '战争', '传记', '考古', '丝路', '罗马', '希腊', '欧洲', '中国史'] },
  { cat: '文学', keys: ['文学', '诗', '散文', '文集', '随笔', '诗歌', '戏剧', '诗词', '名著', '经典', '杂文', '童话', '寓言', '小说集', '散文集', '诗集'] },
  { cat: '小说', keys: ['小说', '长篇', '短篇', '言情', '武侠', '科幻', '悬疑', '推理', '玄幻', '奇幻', '都市', '穿越', '末世', '修仙', '网游', '侦探', '校园', '职场', '军事', '谍战', '宫斗', '种田', '甜宠', '网文', '灵异', '架空'] },
];
function classifyTitle(title) {
  const t = (title || '').toLowerCase();
  if (!t) return '其他';
  for (const r of CATEGORY_RULES) {
    if (r.keys.some((k) => t.includes(k.toLowerCase()))) return r.cat;
  }
  return '其他';
}

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

  // 顶部分类条：全部 + 用户分类 + 其他（当存在不在列表中的分类时出现）
  const cats = settings.categories || [];
  const inList = (c) => cats.includes(c);
  const hasOther = list.some((b) => !inList(b.category));
  filter.classList.remove('hidden');
  filter.innerHTML = '';
  filter.appendChild(mkTagChip('全部', activeCategory === null, () => { activeCategory = null; renderShelf(); }));
  cats.forEach((c) => {
    filter.appendChild(mkTagChip(c, activeCategory === c, () => { activeCategory = c; renderShelf(); }));
  });
  if (hasOther) {
    filter.appendChild(mkTagChip('其他', activeCategory === '其他', () => { activeCategory = '其他'; renderShelf(); }));
  }
  filter.appendChild(mkAddCatChip());

  const shown = activeCategory === null
    ? list
    : activeCategory === '其他'
      ? list.filter((b) => !inList(b.category))
      : list.filter((b) => (b.category || '其他') === activeCategory);

  const grouped = !!settings.shelfGroupByCat;
  el.classList.toggle('grouped', grouped);
  if (!grouped) {
    if (!shown.length) {
      el.innerHTML = '<p class="empty-tip">该分类下暂无书籍。</p>';
      return;
    }
    shown.forEach((b) => el.appendChild(renderBookCard(b)));
    return;
  }

  // 按分类分组书架
  const groups = new Map();
  shown.forEach((b) => {
    const c = b.category || '其他';
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(b);
  });
  const order = cats.concat(['其他']);
  const ordered = Array.from(groups.keys()).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (!ordered.length) {
    el.innerHTML = '<p class="empty-tip">该分类下暂无书籍。</p>';
    return;
  }
  ordered.forEach((c) => {
    el.appendChild(mkGroupHeader(c));
    el.appendChild(mkBookRow(groups.get(c)));
  });
}

// 分类条上的「+ 分类」按钮：弹窗新增分类
function mkAddCatChip() {
  const c = document.createElement('button');
  c.className = 'tag-chip add-cat';
  c.textContent = '+ 分类';
  c.addEventListener('click', () => {
    const name = prompt('新建分类名称：');
    if (!name) return;
    addCategory(name.trim());
  });
  return c;
}
function addCategory(name) {
  const v = (name || '').trim();
  if (!v) return;
  const cats = settings.categories || [];
  if (cats.includes(v)) { alert('分类「' + v + '」已存在'); return; }
  settings.categories = cats.concat(v);
  saveSettings(settings);
  renderCatManager();
  renderShelf();
}
async function removeCategory(cat) {
  if (!confirm('删除分类「' + cat + '」？该分类下的书将归入「其他」。')) return;
  settings.categories = (settings.categories || []).filter((x) => x !== cat);
  saveSettings(settings);
  if (activeCategory === cat) activeCategory = null;
  renderCatManager();
  renderShelf();
}
// 设置页「分类管理」列表渲染
function renderCatManager() {
  const wrap = $('cat-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  (settings.categories || []).forEach((c) => {
    const item = document.createElement('span');
    item.className = 'cat-item';
    item.innerHTML = '<span class="cat-name">' + escapeHtml(c) + '</span>' +
      '<button class="cat-del" type="button" data-cat="' + escapeHtml(c) + '" aria-label="删除">×</button>';
    wrap.appendChild(item);
  });
}

// 从章节 HTML 提取封面：EPUB 封面页常是 <img> 或 SVG <image xlink:href>，解析器已内联为 data URI。
// 只扫前三章（封面/扉页通常在最前），并过滤过小的图标或装饰图。
function extractCoverFromBook(book) {
  const chs = (book && book.chapters) || [];
  for (let i = 0; i < Math.min(chs.length, 3); i++) {
    const html = chs[i].html || '';
    const m = html.match(/<(?:img|image)\b[^>]*?\b(?:src|xlink:href|href)\s*=\s*["'](data:image\/[^"']+)["']/i);
    if (m && m[1].length > 1000) return m[1];
  }
  return '';
}
// 启动时回填历史书籍缺失的元数据（分类 + 封面）。cover 用「是否已定义」判断，
// 空串代表已检查过且无封面，避免每次启动重复扫描整本书的 HTML。
async function ensureBookMeta() {
  const books = await getAllBooks();
  let changed = false;
  for (const b of books) {
    let dirty = false;
    if (!b.category) { b.category = classifyTitle(b.title); dirty = true; }
    if (typeof b.cover === 'undefined') { b.cover = extractCoverFromBook(b); dirty = true; }
    if (dirty) { await putBook(b); changed = true; }
  }
  if (changed) await renderShelf();
}

function mkTagChip(text, active, onClick) {
  const c = document.createElement('button');
  c.className = 'tag-chip' + (active ? ' active' : '');
  c.textContent = text;
  c.addEventListener('click', onClick);
  return c;
}
function mkGroupHeader(text) {
  const h = document.createElement('div');
  h.className = 'group-header';
  h.textContent = text;
  return h;
}
function mkBookRow(books) {
  const wrap = document.createElement('div');
  wrap.className = 'book-list';
  books.forEach((b) => wrap.appendChild(renderBookCard(b)));
  return wrap;
}
// 书架进度百分比：优先用阅读器保存的精确 pct；旧进度数据无 pct 时按已读章节数估算
function shelfProgressPct(b) {
  const prog = getProgress(b.id);
  if (!prog) return 0;
  let pct = (typeof prog.pct === 'number' && isFinite(prog.pct))
    ? prog.pct
    : Math.round((((prog.ci || 0) + 1) / Math.max(1, b.chaptersCount || 1)) * 100);
  return Math.max(0, Math.min(100, Math.round(pct)));
}
function renderBookCard(b) {
  const card = document.createElement('div');
  card.className = 'book-card';
  const coverChar = (b.title || '?').trim().charAt(0) || '?';
  const cat = b.category || '其他';
  const cover = (typeof b.cover === 'string' && /^data:image\//i.test(b.cover)) ? b.cover : '';
  const coverHtml = cover
    ? `<div class="bc-cover has-cover"><img src="${escapeHtml(cover)}" alt="" /></div>`
    : `<div class="bc-cover">${escapeHtml(coverChar)}</div>`;
  const opts = (settings.categories || []).concat(['其他'])
    .map((c) => `<option value="${escapeHtml(c)}"${c === cat ? ' selected' : ''}>${escapeHtml(c)}</option>`)
    .join('');
  card.innerHTML =
    coverHtml +
    `<div class="bc-body">` +
      `<div class="bc-title">${escapeHtml(b.title)}</div>` +
      `<div class="bc-meta">${escapeHtml(b.author || '佚名')} · ${b.chaptersCount} 章</div>` +
      `<select class="bc-cat" data-cat="${b.id}">${opts}</select>` +
    `</div>` +
    `<div class="bc-progress">${shelfProgressPct(b)}%</div>` +
    `<div class="bc-del" data-del="${b.id}">删除</div>`;
  card.addEventListener('click', () => openBook(b.id));
  const del = card.querySelector('.bc-del');
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm(`确定从本机删除《${b.title}》？此操作不可恢复。`)) {
      await deleteBook(b.id);
      if (activeCategory === cat && !(settings.categories || []).includes(cat)) activeCategory = null;
      renderShelf();
    }
  });
  const sel = card.querySelector('.bc-cat');
  sel.addEventListener('click', (e) => e.stopPropagation());
  sel.addEventListener('change', async (e) => {
    e.stopPropagation();
    const book = await getBook(b.id);
    if (!book) return;
    book.category = sel.value;
    await putBook(book);
    renderShelf();
  });
  return card;
}

async function importBook(book) {
  try {
    if (!book.category) book.category = classifyTitle(book.title);
    if (typeof book.cover === 'undefined') book.cover = extractCoverFromBook(book);
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
  enhanceFootnoteMarkers(); // 分页若丢了 <a>，把裸 [n] 补成可点击脚注标记
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
  saveProgress(currentBook.id, ci, pi, computeProgressPct());
  turnCounter++;
  const N = settings.regalRefresh;
  if (N > 0 && ((N === 999 && chapterChanged) || (N !== 999 && turnCounter % N === 0))) {
    regalFlash();
  }
}
// 翻书页动画总入口：按当前主题分发到专属翻页效果。
// 全局 *{transition/animation:none!important}（墨水屏零动画原则）下，动画一律靠内联 !important 放行。
async function flipPage(dir, mutate) {
  const page = $('page');
  if (!settings.pageFlip || !page) { mutate(); return; }
  if (isFlipping) return;
  isFlipping = true;
  if (settings.theme === 'ink') return flipInk(dir, mutate);
  return flipBook(dir, mutate);
}

// 收尾：清掉翻页期间注入的内联样式，交还零动画原则
function endFlip() {
  const page = $('page');
  page.style.transition = '';
  page.style.transform = '';
  page.style.transformOrigin = '';
  page.style.opacity = '';
  page.style.filter = '';
  page.classList.remove('flipping');
  page.style.removeProperty('--flip-shade');
  isFlipping = false;
}

// ① 墨水风：毛笔墨迹先横扫淡化，随后下一页文字从模糊中慢慢浮现
async function flipInk(dir, mutate) {
  const page = $('page');
  const vp = $('page-viewport');
  const ov = document.createElement('div');
  ov.className = 'ink-flip';
  ov.innerHTML =
    '<svg viewBox="0 0 340 470" preserveAspectRatio="none">' +
      '<g class="ink-splats">' +
        '<circle class="ink-splat" cx="70" cy="210" r="3"/>' +
        '<circle class="ink-splat" cx="300" cy="250" r="2.4"/>' +
        '<circle class="ink-splat" cx="265" cy="205" r="2"/>' +
        '<circle class="ink-splat" cx="95" cy="262" r="1.8"/>' +
      '</g>' +
      '<path class="ink-stroke2" d="M70 205 C140 198 210 200 278 205 C236 214 156 214 70 205 Z"/>' +
      '<path class="ink-stroke" d="M28 236 C92 217 176 219 256 230 C298 235 320 231 330 227 C314 250 268 256 198 251 C116 246 72 252 28 236 Z"/>' +
    '</svg>';
  vp.appendChild(ov);
  void ov.offsetWidth; // 触发墨迹 keyframes 动画

  // 旧页缓慢虚化退场（笔迹覆盖其上，先“化”掉）
  page.style.setProperty('transition', 'opacity .4s ease, transform .4s ease, filter .4s ease', 'important');
  page.style.transform = 'translateY(-10px) scale(.985)';
  page.style.filter = 'blur(4px)';
  page.style.opacity = '0';
  await wait(600);

  // 换页：新页从模糊里慢慢浮现
  mutate();
  page.style.transform = 'translateY(10px) scale(.99)';
  page.style.filter = 'blur(6px)';
  page.style.opacity = '0';
  void page.offsetWidth;
  page.style.setProperty('transition', 'opacity 1.3s ease, transform 1.3s ease, filter 1.3s ease', 'important');
  page.style.transform = 'translateY(0) scale(1)';
  page.style.filter = 'blur(0)';
  page.style.opacity = '1';

  await wait(1350);
  ov.remove();
  endFlip();
}

// ② 简约：整页水平滑动翻页（参考夸克在线阅读——当前页水平滑出，下一页从对侧滑入）
async function flipBook(dir, mutate) {
  const page = $('page');
  const vp = $('page-viewport');
  if (!page) { mutate(); return; }
  const isNext = dir === 'next';
  const exitTo = isNext ? '-100%' : '100%';    // 当前页滑出方向
  const enterFrom = isNext ? '100%' : '-100%';  // 新页进入方向
  // 克隆当前页（旧内容）作为覆盖层
  const leaf = document.createElement('div');
  leaf.className = 'page flip-leaf slide-leaf';
  leaf.innerHTML = page.innerHTML;
  leaf.style.transition = 'none';
  leaf.style.transform = 'translateX(0)';
  vp.appendChild(leaf);
  // 真实页先置于对侧起始位（藏于 leaf 之下）
  page.style.setProperty('transition', 'none', 'important');
  page.style.transform = `translateX(${enterFrom})`;
  void page.offsetWidth;
  // 换页：真实页渲染新内容
  await mutate();
  // 同步滑动：旧页滑出 + 新页滑入
  const ease = 'transform .36s cubic-bezier(.4,0,.2,1)';
  leaf.style.setProperty('transition', ease, 'important');
  page.style.setProperty('transition', ease, 'important');
  leaf.style.transform = `translateX(${exitTo})`;
  page.style.transform = 'translateX(0)';
  await wait(380);
  leaf.remove();
  endFlip();
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function nextPage() {
  hideTranslate();
  if (pi < pages.length - 1) {
    await flipPage('next', async () => { pi++; await afterPageTurn(false); });
  } else if (ci < currentBook.chapters.length - 1) {
    await flipPage('next', async () => { ci++; pi = 0; paginateCurrentChapter(); await afterPageTurn(true); });
  }
}
async function prevPage() {
  hideTranslate();
  if (pi > 0) {
    await flipPage('prev', async () => { pi--; await afterPageTurn(false); });
  } else if (ci > 0) {
    await flipPage('prev', async () => { ci--; paginateCurrentChapter(); pi = pages.length - 1; await afterPageTurn(true); });
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
  document.body.classList.add('reader-active'); // 阅读时隐藏底部导航栏
  closePanels();
  // 必须在阅读器可见后再分页：hidden 状态下 #page-viewport 高度为 0，会触发“每页 1 字”极端分支
  if (!currentPdfDoc) {
    paginateCurrentChapter();
  }
  await renderPage();
  buildToc();
  buildBookmarks();
  startReadingTimer();
  // 进入阅读器：把来源视图压入返回栈（通常为书架）
  if (currentView !== 'reader') navStack.push(currentView);
  currentView = 'reader';
}
function exitReader() {
  hideTranslate();
  stopReadingTimer();
  if (currentPdfDoc) {
    try { currentPdfDoc.destroy(); } catch (e) {}
    currentPdfDoc = null;
    pdfImageCache.clear();
  }
  $('reader').classList.add('hidden');
  document.body.classList.remove('reader-active');
  currentBook = null;
  renderShelf();
}

// ---------- 导航与返回栈：书架/统计/设置/法律 为子视图，阅读器为独立层 ----------
const VIEW_ID = { shelf: 'shelf', stats: 'view-stats', settings: 'view-settings', legal: 'view-legal' };
let navStack = [];        // 视图历史（不含当前）
let currentView = 'shelf'; // 当前视图
let lastBackTs = 0;       // 根视图"双击退出"计时

// 仅显示某个子视图（书架/统计/设置/法律），隐藏阅读器
function showSubView(v) {
  const target = VIEW_ID[v];
  ['shelf', 'view-stats', 'view-settings', 'view-legal'].forEach((id) => $(id).classList.toggle('hidden', id !== target));
  document.querySelectorAll('#tabbar .tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
  document.body.classList.remove('reader-active');
}
// 导航到子视图：forward 时压栈；fromBack 不压栈；reset 清空历史（底部 Tab 切换用）
function showView(v, opts = {}) {
  if (opts.reset) navStack = [];
  if (!opts.fromBack && v !== currentView) navStack.push(currentView);
  currentView = v;
  showSubView(v);
  if (v === 'stats') renderStats('day');
}
// 返回上一视图：阅读器单独处理（含清理）；根视图双击退出（主流 App 做法）
function goBack() {
  if (currentView === 'reader') {
    exitReader();
    const prev = navStack.length ? navStack.pop() : 'shelf';
    currentView = prev; showSubView(prev);
    return;
  }
  if (navStack.length) {
    const prev = navStack.pop();
    currentView = prev; showSubView(prev);
  } else {
    handleRootBack();
  }
}
function handleRootBack() {
  const now = Date.now();
  if (now - lastBackTs < 2000) {
    const app = capacitorApp();
    if (app) { try { app.exitApp(); } catch (e) {} }
  } else {
    lastBackTs = now;
    showToast('再按一次退出');
  }
}

// ---------- 法律声明：隐私政策 / 用户协议 / 权限说明 ----------
function openLegal(which) {
  const doc = LEGAL_CONTENT[which] || LEGAL_CONTENT.privacy;
  showView('legal');
  $('legal-title').textContent = doc.title;
  $('legal-body').innerHTML = doc.html;
  document.querySelectorAll('.legal-tab').forEach((t) => t.classList.toggle('active', t.dataset.legal === which));
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
  $('footnote-pop').classList.add('hidden');
}
// ---------- 脚注 ----------
// 真实 EPUB 常见结构（如《雍正帝》）：
//   正文引用 <a href="#m1" id="w1">[1]</a>
//   章末注释 <p class="footnote"><a href="#w1" id="m1">[1]</a> 注释文本……</p>
// 注意：目标 id 往往只落在「编号 <a>」上，注释文本在它的父容器里；
// 早期实现只取该 <a> 的 textContent（就是 "[1]"），导致弹层看似空白。
// 另外分页器 splitBlock 对超长段落按纯文本重建会丢掉 <a>，故对裸 [n] 标记做可点击包装兜底。

// 在任意 DOM 子树内按 id 精确查找（避免 querySelector 对特殊字符 id 的转义问题）
function findByIdIn(root, id) {
  if (!root || !id) return null;
  const nodes = root.querySelectorAll('[id]');
  for (const n of nodes) if (n.id === id) return n;
  return null;
}
// 在当前页 DOM 与全书章节 HTML 中按 id 找目标（脚注常落在别的页/章）
function findFootnoteTargetById(id) {
  let el = findByIdIn(document, id);
  if (el) return el;
  if (currentBook && currentBook.chapters) {
    const tmp = document.createElement('div');
    for (const ch of currentBook.chapters) {
      tmp.innerHTML = ch.html || '';
      const f = findByIdIn(tmp, id);
      if (f) return f;
    }
  }
  return null;
}
function isFootnoteBlock(el) {
  if (!el) return false;
  const cls = (el.className || '').toLowerCase();
  const et = el.getAttribute ? (el.getAttribute('epub:type') || '') : '';
  return /(foot|note|endnote|annotation)/.test(cls) || /footnote|endnote|rearnote/.test(et);
}
// 从「编号 <a>」向上找脚注容器：优先语义 class / epub:type，其次文本明显更长且不过长的块级父元素
function findFootnoteContainer(el) {
  const own = ((el && el.textContent) || '').trim();
  let cur = el && el.parentElement;
  for (let i = 0; i < 4 && cur; i++, cur = cur.parentElement) {
    if (isFootnoteBlock(cur)) return cur;
    const raw = (cur.textContent || '').trim();
    if (/^(p|li|div|aside|section|td)$/i.test(cur.tagName || '') &&
        raw.length > own.length + 6 && raw.length < 300) return cur;
  }
  return el;
}
// 取容器全文：剔除「返回正文」回链与开头编号，避免把 "[1]" 当成注释内容
function cleanFootnoteText(el) {
  if (!el) return null;
  const clone = el.cloneNode(true);
  clone.querySelectorAll('a').forEach((a) => {
    const t = (a.textContent || '').trim();
    const symbolic = /^[\u2190\u21a9\u21e7\u2191\u21e0\u2934\u21b5*\u2020\u2021]+$/.test(t);
    const backCls = /back|return/i.test(a.className || '');
    const leadingNum = /^\[?\d{1,3}\]?$/.test(t) && a === clone.firstElementChild;
    if (symbolic || backCls || leadingNum) a.remove();
  });
  let text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
  text = text.replace(/^\[\d{1,3}\]\s*/, '').replace(/^\d{1,3}[.、]\s*/, '').trim();
  return text || null;
}
function isJustMarker(text, marker) {
  const t = (text || '').trim();
  if (!t) return true;
  if (t.length <= 6 && /^\[?\d{1,3}\]?[.、]?$/.test(t)) return true;
  if (marker && t === marker.trim()) return true;
  return false;
}
// 兜底：按标记编号在章节 HTML 的脚注容器里找注释（应对分页丢 <a> / 目标只有编号）
function resolveFootnoteByNumber(num) {
  if (!num || !currentBook || !currentBook.chapters) return null;
  const chs = currentBook.chapters;
  const order = [chs[ci]].concat(chs.filter((_, i) => i !== ci)).filter(Boolean);
  const re = new RegExp('^\\[?' + num + '\\]?(?:[.、\\s]|$)');
  for (const ch of order) {
    const tmp = document.createElement('div');
    tmp.innerHTML = ch.html || '';
    const cands = Array.from(tmp.querySelectorAll('p, li, div, aside, section')).filter(isFootnoteBlock);
    for (const el of cands) {
      if (cands.some((o) => o !== el && el.contains(o))) continue; // 只取叶子脚注块
      if (!re.test((el.textContent || '').trim())) continue;
      const text = cleanFootnoteText(el);
      if (text) return text;
    }
  }
  return null;
}
// 主解析：先 href→id（并上溯脚注容器），若只拿到编号则按编号兜底
function resolveFootnote(href, markerText) {
  const id = (href || '').replace(/^#/, '').trim();
  const num = ((markerText || '').trim().match(/^\[?(\d{1,3})\]?$/) || [])[1] || null;
  if (id) {
    const el = findFootnoteTargetById(id);
    if (el) {
      const text = cleanFootnoteText(findFootnoteContainer(el));
      if (!isJustMarker(text, markerText)) return text;
    }
  }
  if (num) return resolveFootnoteByNumber(num);
  return null;
}
function showFootnote(text, ref) {
  $('footnote-ref').textContent = ref ? '· ' + ref : '';
  $('footnote-text').textContent = text;
  $('footnote-pop').classList.remove('hidden');
}
// 把分页后残留的裸 [n] 标记包成可点击元素（splitBlock 会丢 <a>）
function enhanceFootnoteMarkers() {
  const page = $('page');
  if (!page) return;
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !/\[\d{1,3}\]/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      let p = n.parentElement;
      while (p && p !== page) {
        if (/^(A|BUTTON|SELECT|TEXTAREA)$/.test(p.tagName) || p.classList.contains('fn-marker')) return NodeFilter.FILTER_REJECT;
        p = p.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((n) => {
    const frag = document.createDocumentFragment();
    const src = n.nodeValue;
    let last = 0, m;
    const re = /\[(\d{1,3})\]/g;
    while ((m = re.exec(src))) {
      frag.appendChild(document.createTextNode(src.slice(last, m.index)));
      const s = document.createElement('span');
      s.className = 'fn-marker';
      s.dataset.fn = m[1];
      s.textContent = m[0];
      frag.appendChild(s);
      last = m.index + m[0].length;
    }
    frag.appendChild(document.createTextNode(src.slice(last)));
    n.parentNode.replaceChild(frag, n);
  });
}
function initFootnoteLinks() {
  const page = $('page');
  if (!page) return;
  // 事件委托：#page 元素本身常驻，内部 html 每页替换，委托可一直生效
  page.addEventListener('click', (e) => {
    const t = e.target;
    const marker = t.closest && t.closest('.fn-marker');
    const a = t.closest && t.closest('a');
    if (!marker && !(a && (a.getAttribute('href') || '').startsWith('#'))) return;
    const label = ((marker || a).textContent || '').trim();
    // 只拦截「脚注型」锚点，避免误伤目录/章节跳转等普通内部链接
    const looksLikeMarker = /^\[?\d{1,3}\]?$/.test(label) || /^[\*\u2020\u2021\u2022]+$/.test(label);
    const semantic = a && (
      /(foot|note|ref|endnote|annotation)/.test((a.className || '').toLowerCase()) ||
      /noteref|footnote/i.test(a.getAttribute('epub:type') || '')
    );
    if (!marker && !looksLikeMarker && !semantic) return;
    e.preventDefault();
    e.stopPropagation(); // 阻止冒泡到 page-viewport 触发翻页/收起栏
    hideTranslate();
    const el = marker || a;
    const text = resolveFootnote(marker ? '' : a.getAttribute('href'), label);
    // 即使没找到也给出明确提示，绝不「点击后空白」
    showFootnote(text || '本书未找到该脚注的注释内容。', label);
  });
  $('footnote-close').addEventListener('click', hideTranslate);
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
  const fpop = $('footnote-pop');
  if (!pop.classList.contains('hidden') || !epop.classList.contains('hidden') || !fpop.classList.contains('hidden')) return; // 弹层开着时不抢焦点
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

// ---------- 阅读计时 / 打卡 ----------
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}
// 阅读时累计时长：仅在阅读器可见、未在后台、未打开面板时计时；跨过打卡阈值自动打卡
function startReadingTimer() {
  stopReadingTimer();
  readingLastTs = Date.now();
  readingTimer = setInterval(() => {
    const now = Date.now();
    const dt = now - readingLastTs;
    readingLastTs = now;
    if (document.hidden) return; // 后台不计时，避免回到前台时跳变
    if ($('reader').classList.contains('hidden')) return;
    if (document.querySelector('.panel.open')) return; // 面板打开（设置/AI/统计）时暂停
    if (dt <= 0 || dt > 60000) return; // 异常间隔忽略
    const { justCheckedIn } = addReadingTime(currentBook.id, dt);
    if (justCheckedIn) showToast(`今日阅读已打卡 ✓（≥${settings.checkinGoalMin} 分钟）`);
  }, 1000);
}
function stopReadingTimer() {
  if (readingTimer) { clearInterval(readingTimer); readingTimer = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  readingLastTs = Date.now(); // 回到前台重置，避免补偿式跳增
});

// ---------- 阅读统计面板 ----------
function renderStats(mode) {
  const stats = loadStats();
  const agg = aggregateStats(stats, mode);
  const totalMin = Math.round(agg.totalMs / 60000);
  $('ss-total').textContent = totalMin + ' 分钟';
  const bookIds = Object.keys(agg.byBook);
  $('ss-books').textContent = bookIds.length + ' 本';
  let checkinText = '未打卡';
  if (mode === 'day') {
    const today = stats[todayKey()];
    checkinText = today && today.checkin ? '已打卡 ✓' : '未打卡';
  } else {
    checkinText = agg.checkinDays > 0 ? `已打卡 ${agg.checkinDays} 天` : '未打卡';
  }
  $('ss-checkin').textContent = checkinText;
  const list = $('stats-booklist');
  list.innerHTML = '';
  if (!bookIds.length) {
    list.innerHTML = '<p class="empty-tip">本期还没有阅读记录。</p>';
    return;
  }
  listBooksMeta().then((metas) => {
    if ($('view-stats').classList.contains('hidden')) return; // 统计页已关闭，放弃填充
    const titleMap = {};
    metas.forEach((m) => (titleMap[m.id] = m.title));
    const sorted = bookIds.slice().sort((a, b) => agg.byBook[b] - agg.byBook[a]);
    sorted.forEach((id) => {
      const min = Math.round(agg.byBook[id] / 60000);
      const d = document.createElement('div');
      d.className = 'stats-book-row';
      d.innerHTML =
        `<span class="sb-title">${escapeHtml(titleMap[id] || '未知书目')}</span>` +
        `<span class="sb-time">${min} 分钟</span>`;
      list.appendChild(d);
    });
  });
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
  // 导入区“更多类型”折叠：默认只展示常见格式，点开才显示 FB2/HTML/DOCX
  $('import-more').addEventListener('click', () => {
    const extra = $('import-extra');
    const hidden = extra.classList.toggle('hidden');
    $('import-more').textContent = hidden ? '更多类型 ▾' : '收起 ▴';
  });
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
  $('import-fb2').addEventListener('click', () => $('file-fb2').click());
  $('file-fb2').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const book = await parseFb2(f);
      await importBook(book);
    } catch (err) {
      alert('FB2 导入失败：' + err.message);
    }
    e.target.value = '';
  });
  $('import-html').addEventListener('click', () => $('file-html').click());
  $('file-html').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const book = await parseHtml(f);
      await importBook(book);
    } catch (err) {
      alert('HTML 导入失败：' + err.message);
    }
    e.target.value = '';
  });
  $('import-docx').addEventListener('click', () => $('file-docx').click());
  $('file-docx').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const book = await parseDocx(f);
      await importBook(book);
    } catch (err) {
      alert('DOCX 导入失败：' + err.message);
    }
    e.target.value = '';
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
      } else if (/\.fb2$/i.test(f.name)) {
        try { await importBook(await parseFb2(f)); } catch (err) { alert('FB2 导入失败：' + err.message); }
      } else if (/\.html?$/i.test(f.name)) {
        try { await importBook(await parseHtml(f)); } catch (err) { alert('HTML 导入失败：' + err.message); }
      } else if (/\.docx$/i.test(f.name)) {
        try { await importBook(await parseDocx(f)); } catch (err) { alert('DOCX 导入失败：' + err.message); }
      } else {
        alert('不支持的格式：' + f.name + '\n目前支持 .txt / .epub / .pdf / .mobi / .azw / .fb2 / .html / .docx（AZW3/KFX 请用 Calibre 转 EPUB）。');
      }
    }
  });

  // 阅读器导航
  $('btn-back').addEventListener('click', goBack);
  $('btn-prev').addEventListener('click', prevPage);
  $('btn-next').addEventListener('click', nextPage);
  $('btn-toc').addEventListener('click', () => openPanel('panel-toc'));
  $('btn-toc-top').addEventListener('click', () => openPanel('panel-toc'));
  $('btn-bookmark').addEventListener('click', () => { buildBookmarks(); openPanel('panel-bookmark'); });
  $('btn-ai').addEventListener('click', () => { openPanel('panel-ai'); loadCachedGuide(); });
  document.querySelectorAll('.stats-tab').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.stats-tab').forEach((x) => x.classList.toggle('active', x === b));
      renderStats(b.dataset.statsTab);
    });
  });
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
    // 脚注弹层开启时，点击翻页区先关闭它（脚注链接自身已 stopPropagation，不会走到这里）
    if (!$('footnote-pop').classList.contains('hidden')) { hideTranslate(); return; }
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
  // 打卡阈值 + 书架分组
  bindRange('set-checkin', 'checkinGoalMin', (v) => parseInt(v, 10), (v) => ($('val-checkin').textContent = v + ' 分钟'));
  $('set-group-cat').addEventListener('change', (e) => {
    settings.shelfGroupByCat = e.target.checked;
    applySettings(); saveSettings(settings);
    renderShelf();
  });
  // 分类管理：新增 / 删除分类
  $('cat-add').addEventListener('click', () => {
    const inp = $('cat-input');
    addCategory(inp.value);
    inp.value = '';
  });
  $('cat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { addCategory(e.target.value); e.target.value = ''; }
  });
  $('cat-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-del');
    if (btn) removeCategory(btn.dataset.cat);
  });
  initTranslateSelection();
  initFootnoteLinks();

  // 底部导航栏：切换主 Tab 时清空返回历史（主流 App 行为）
  document.querySelectorAll('#tabbar .tab').forEach((t) => {
    t.addEventListener('click', () => showView(t.dataset.view, { reset: true }));
  });
  // 独立页面的导航：带 data-back 的"返回"按钮走返回栈；其余为前进导航
  document.querySelectorAll('[data-nav]').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.back) { goBack(); return; }
      showView(b.dataset.nav);
      if (b.dataset.legal) openLegal(b.dataset.legal);
    });
  });
  // 法律声明页内的三个标签切换
  document.querySelectorAll('.legal-tab').forEach((b) => {
    b.addEventListener('click', () => openLegal(b.dataset.legal));
  });

  // Android 硬件返回键：交给返回栈处理（不直退应用）。仅在原生外壳生效，Web 端无效（不影响）。
  const app = capacitorApp();
  if (app) {
    try {
      app.addListener('backButton', () => goBack());
    } catch (e) {}
  }
  // 翻页动画开关
  $('set-flip').addEventListener('change', (e) => {
    settings.pageFlip = e.target.checked;
    saveSettings(settings);
  });

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
  ensureBookMeta();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // 新 Service Worker 接管后自动刷新一次，避免升级后一直显示旧缓存页面
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (sessionStorage.getItem('sw-reloaded') === '1') return;
      sessionStorage.setItem('sw-reloaded', '1');
      location.reload();
    });
  }
  window.__INK_INIT_DONE = true; // 诊断标记：init 已完成
}
init();
