// 砚白 Inkstone —— Service Worker（离线缓存应用外壳）
// 缓存版本号：每次改动 ASSETS 列表里的任意文件（尤其 js/app.js 等自身脚本）都必须 +1，
// 否则 WebView 升级后会继续从旧缓存喂回旧文件，导致修好的 bug 在真机“看起来没修”。
const CACHE = 'inkreader-v7';
// 巨大的、永不改变的第三方库走 cache-first（首次拉取后固化）；
// 应用自身脚本/css 走 network-first，永远取 APK 内最新，杜绝旧缓存覆盖新代码。
const VENDOR = ['js/vendor/pdf.min.js', 'js/vendor/pdf.worker.min.js'];
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/store.js',
  'js/paginate.js',
  'js/importers.js',
  'js/pdfview.js',
  'js/translate.js',
  'js/mobidec.js',
  'js/vendor/fflate.js',
  'js/vendor/pdf.min.js',
  'js/vendor/pdf.worker.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isVendor = VENDOR.some((v) => url.pathname.endsWith(v));
  if (isVendor) {
    // 第三方大库：cache-first，命中即返回，未命中再网络拉取并缓存
    e.respondWith(
      caches.match(req).then((cached) =>
        cached || fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
      )
    );
    return;
  }
  // 应用自身资源：network-first（永远取最新），失败再退回缓存（离线可用）
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});
