/* 嘀嗒 PWA Service Worker
   - 导航请求：网络优先，3 秒超时或失败回落到缓存页面（离线可开）
   - 同源静态资源：缓存优先 + 后台静默更新
   - 跨域资源（字体 / ECharts CDN）：有缓存先给，同时后台刷新
   仓库已更名为 dida-pwa，站点根路径为 /dida-pwa/，本文件内相对路径均以该目录为基准
*/
const VERSION = 'v11';
const CACHE = 'dida-' + VERSION;
const APP_PAGE = './';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];

/* 安装：逐个预缓存，单个失败不影响整体（addAll 是原子的，容易整批失败） */
self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(CORE.map(url => cache.add(new Request(url, { cache: 'reload' }))))
    ).then(() => self.skipWaiting())
  );
});

/* 激活：清掉旧版本缓存 */
self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('dida-') && k !== CACHE).map(k => caches.delete(k)))
      .then(() => self.clients.claim()))
  );
});

self.addEventListener('message', evt => {
  if (evt.data && evt.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function putInCache(req, res) {
  if (!res) return;
  // 只缓存完整响应：ok 为真，或跨域 opaque（status 0）
  if (!res.ok && res.type !== 'opaque') return;
  const copy = res.clone();
  caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), timeout(3000)]);
    putInCache(req, res);
    return res;
  } catch (e) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const page = await cache.match(APP_PAGE, { ignoreSearch: true });
    if (page) return page;
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body style="margin:0;display:grid;place-items:center;height:100vh;background:#EDEDE7;color:#15191A;font-family:sans-serif">' +
      '<div style="text-align:center"><div style="font-size:40px">⏱</div><p style="font-size:15px;color:#6E767B">当前离线，且缓存未就绪<br>请联网后再打开一次</p></div></body>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) {
    fetch(req).then(res => putInCache(req, res)).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    putInCache(req, res);
    return res;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', evt => {
  const req = evt.request;
  if (req.method !== 'GET') return;
  if (req.url.startsWith('chrome-extension://')) return;

  if (req.mode === 'navigate') {
    evt.respondWith(networkFirst(req));
    return;
  }
  // 字体 CDN 的 CSS 带查询串，按 URL 全量匹配
  evt.respondWith(cacheFirst(req));
});
//（注：内容由AI生成）
