// 本地存储：书籍内容存 IndexedDB（容量大）；设置/进度/书签/书架元数据存 localStorage。
// 关键：在「不透明源 / 隐私模式 / 某些预览沙箱」里 IndexedDB 与 localStorage 会被拒绝，
// 此时自动降级为内存存储，保证应用仍可运行（代价是不跨刷新持久化）。

const DB_NAME = 'inkreader';
const DB_VERSION = 1;
const STORE_BOOKS = 'books';

let dbPromise = null;
let dbAvailable = true; // 一旦 IndexedDB 被拒绝，置 false 并永久走内存
const memBooks = new Map(); // 内存兜底：id -> book

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        if (typeof indexedDB === 'undefined' || !indexedDB) {
          dbAvailable = false;
          reject(new Error('IndexedDB 不可用'));
          return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_BOOKS)) {
            db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          dbAvailable = false;
          reject(req.error || new Error('IndexedDB 打开失败'));
        };
      } catch (e) {
        dbAvailable = false;
        reject(e);
      }
    });
  }
  return dbPromise;
}

function idbPut(db, book) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readwrite');
    tx.objectStore(STORE_BOOKS).put(book);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function idbGet(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readonly');
    const r = tx.objectStore(STORE_BOOKS).get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}
function idbDelete(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readwrite');
    tx.objectStore(STORE_BOOKS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function idbGetAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readonly');
    const r = tx.objectStore(STORE_BOOKS).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}
function memMetaList() {
  return Array.from(memBooks.values())
    .map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author || '',
      source: b.source,
      addedAt: b.addedAt,
      chaptersCount: (b.chapters || []).length,
    }))
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

export async function putBook(book) {
  if (!dbAvailable) {
    memBooks.set(book.id, book);
    return;
  }
  try {
    const db = await openDB();
    await idbPut(db, book);
  } catch (e) {
    dbAvailable = false;
    memBooks.set(book.id, book);
  }
}
export async function getBook(id) {
  if (!dbAvailable) return memBooks.get(id) || null;
  try {
    const db = await openDB();
    return await idbGet(db, id);
  } catch (e) {
    dbAvailable = false;
    return memBooks.get(id) || null;
  }
}
export async function deleteBook(id) {
  if (!dbAvailable) {
    memBooks.delete(id);
    return;
  }
  try {
    const db = await openDB();
    await idbDelete(db, id);
  } catch (e) {
    dbAvailable = false;
    memBooks.delete(id);
  }
}
export async function listBooksMeta() {
  if (!dbAvailable) return memMetaList();
  try {
    const db = await openDB();
    const all = await idbGetAll(db);
    return all
      .map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author || '',
        source: b.source,
        addedAt: b.addedAt,
        chaptersCount: (b.chapters || []).length,
      }))
      .concat(memMetaList())
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  } catch (e) {
    dbAvailable = false;
    return memMetaList();
  }
}

// ---------- localStorage 部分（设置 / 进度 / 书签）；不可用时降级内存 ----------
const K_SETTINGS = 'inkreader:settings';
const K_PROGRESS = 'inkreader:progress';
const K_BOOKMARKS = 'inkreader:bookmarks';

const memoryKV = { settings: null, progress: {}, bookmarks: {} };

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    if (key === K_SETTINGS) return memoryKV.settings || fallback;
    if (key === K_PROGRESS) return memoryKV.progress || fallback;
    if (key === K_BOOKMARKS) return memoryKV.bookmarks || fallback;
    return fallback;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    if (key === K_SETTINGS) memoryKV.settings = value;
    else if (key === K_PROGRESS) memoryKV.progress = value;
    else if (key === K_BOOKMARKS) memoryKV.bookmarks = value;
  }
}

export const DEFAULT_SETTINGS = {
  theme: 'eink',
  fontFamily: 'serif',
  fontSize: 20,
  lineHeight: 1.75,
  margin: 22,
  justify: true,
  letterSpacing: 0,
  paragraphSpacing: 0.7,
  firstLineIndent: true,
  regalRefresh: 6,
  // 翻译（默认关闭，不影响离线阅读；启用后仅在使用时联网）
  translateProvider: 'none',
  translateApiKey: '',
  translateLlmBase: 'https://api.openai.com/v1',
  translateLlmModel: 'gpt-4o-mini',
  translateDir: 'auto',
};

export function loadSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, lsGet(K_SETTINGS, {}));
}
export function saveSettings(s) {
  lsSet(K_SETTINGS, s);
}

export function loadProgress() {
  return lsGet(K_PROGRESS, {});
}
export function saveProgress(bookId, ci, pi) {
  const all = loadProgress();
  all[bookId] = { ci, pi };
  lsSet(K_PROGRESS, all);
}
export function getProgress(bookId) {
  return loadProgress()[bookId] || null;
}

export function loadBookmarks() {
  return lsGet(K_BOOKMARKS, {});
}
export function saveBookmarks(map) {
  lsSet(K_BOOKMARKS, map);
}
