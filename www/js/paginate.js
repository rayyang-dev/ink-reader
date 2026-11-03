// 分页阅读引擎（墨水屏核心）
// 思路：把章节 HTML 按当前排版参数精确切分为“单页”，每页正好填满可视区域。
// 不使用滚动，避免墨水屏残影；翻页即替换 .page 的 innerHTML，零动画瞬时切换。
//
// metrics = { pageWidth, pageHeight }  —— 必须与真实阅读区完全一致（同字体/边距/字号）。

function applyTypeVars(el) {
  // 排版变量由 CSS 在 .page / .measure-host 上通过 [data-theme] 与内联 style 提供，
  // 这里仅确保 measure 容器继承字体相关变量（通过 className 继承即可）。
  el.classList.add('measure-host');
}

// 创建一页（带固定宽高用于测量溢出）
function newPage(host, metrics) {
  const page = document.createElement('div');
  page.className = 'page measure-page';
  page.style.width = metrics.pageWidth + 'px';
  page.style.height = metrics.pageHeight + 'px';
  host.appendChild(page);
  return page;
}

function pushPage(state) {
  state.pages.push(state.cur.innerHTML);
}

// 尝试把 block 放进当前页；放得下返回 true，否则回滚返回 false
function tryAppend(pageEl, block, metrics) {
  const probe = block.cloneNode(true);
  pageEl.appendChild(probe);
  if (pageEl.scrollHeight <= metrics.pageHeight) return true;
  pageEl.removeChild(probe);
  return false;
}

// 单个 block 超过一页时，按字符拆分到多页（保留外层标签，丢失块内跨页行内样式——可接受）
function splitBlock(state, block, host, metrics) {
  const text = block.textContent || '';
  if (!text) return;
  const tag = block.tagName.toLowerCase();
  const cls = block.getAttribute && block.getAttribute('class');
  let offset = 0;
  let frag = makeFrag(tag, cls);
  state.cur.appendChild(frag);
  let i = 1;
  while (offset + i <= text.length) {
    frag.textContent = text.slice(offset, offset + i);
    if (state.cur.scrollHeight > metrics.pageHeight) {
      if (i === 1) {
        // 连一个字符都放不下（极端字号/极小页），强制放置并翻页，避免死循环
        frag.textContent = text.slice(offset, offset + 1);
        pushPage(state);
        state.cur = newPage(host, metrics);
        frag = makeFrag(tag, cls);
        state.cur.appendChild(frag);
        offset += 1;
        i = 1;
      } else {
        frag.textContent = text.slice(offset, offset + i - 1);
        pushPage(state);
        state.cur = newPage(host, metrics);
        frag = makeFrag(tag, cls);
        state.cur.appendChild(frag);
        offset = offset + i - 1;
        i = 1;
      }
    } else {
      i++;
    }
  }
}

function makeFrag(tag, cls) {
  const el = document.createElement(tag || 'p');
  if (cls) el.setAttribute('class', cls);
  return el;
}

export function paginateChapter(html, metrics) {
  const host = document.createElement('div');
  applyTypeVars(host);
  host.style.width = metrics.pageWidth + 'px';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);

  host.innerHTML = html;
  const sourceNodes = Array.from(host.childNodes).filter(
    (n) => !(n.nodeType === 3 && !n.textContent.trim()) // 丢弃纯空白文本节点
  );
  host.innerHTML = '';

  const state = { pages: [], cur: null };
  state.cur = newPage(host, metrics);

  for (const node of sourceNodes) {
    const block = node.cloneNode(true);
    if (tryAppend(state.cur, block, metrics)) continue;
    if (state.cur.childNodes.length === 0) {
      splitBlock(state, block, host, metrics);
    } else {
      pushPage(state);
      state.cur = newPage(host, metrics);
      if (tryAppend(state.cur, block, metrics)) continue;
      splitBlock(state, block, host, metrics);
    }
  }
  pushPage(state);
  host.remove();
  return state.pages;
}

// 估算章节字符数（用于全局进度百分比）
export function chapterCharCount(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').length;
}
