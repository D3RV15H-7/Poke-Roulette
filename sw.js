/* PokéRoulette v114: network-first app files, offline last-good-page fallback.
   Collection/account data belongs to localStorage/Firebase, never this cache. */
const SHELL_CACHE = 'pokeroulette-app-shell-v114';
const APP_ROOT = new URL('./', self.location.href);
const APP_INDEX = new URL('index.html', APP_ROOT).href;
const isShellAsset = url => url.origin === APP_ROOT.origin &&
  url.pathname.startsWith(APP_ROOT.pathname) &&
  /\/(?:manifest\.json|favicon(?:-[^/]*)?\.(?:png|ico|svg)|apple-touch-icon(?:-[^/]*)?\.(?:png|svg)|icon(?:-[^/]*)?\.(?:png|svg|webp))$/i.test(url.pathname);
function shellKey(request) {
  const url = new URL(request.url);
  if (request.mode === 'navigate' && (url.pathname === APP_ROOT.pathname || url.pathname === new URL(APP_INDEX).pathname)) return APP_INDEX;
  url.searchParams.delete('__pr_app_update');
  return url.href;
}
function isAppHTML(text) { return /<body\b[^>]*\bdata-app-build\s*=\s*["']v\d+["']/i.test(text); }
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const response = await fetch(APP_INDEX, { cache: 'no-store' });
      if (response.ok && isAppHTML(await response.clone().text())) await (await caches.open(SHELL_CACHE)).put(APP_INDEX, response);
    } catch (_) { /* Existing app remains available when installation is offline. */ }
  })());
});
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('message', event => {
  if (event.data?.type === 'POKEROULETTE_SKIP_WAITING') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== APP_ROOT.origin) return;
  // Version probes MUST reach the server, even while an old document is open.
  if (url.searchParams.has('__pr_update_check')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  const appNavigation = request.mode === 'navigate' &&
    (url.pathname === APP_ROOT.pathname || url.pathname === new URL(APP_INDEX).pathname);
  if (!appNavigation && !isShellAsset(url)) return; // Never intercept APIs/cards/other apps.
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE).catch(() => null), key = shellKey(request);
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (!response.ok) throw new Error('App file unavailable');
      if (!appNavigation || isAppHTML(await response.clone().text())) {
        // Store a clone before returning so the offline copy is complete.
        try { await cache?.put(key, response.clone()); } catch (_) { /* A full cache must not block fresh app files. */ }
        return response;
      }
      throw new Error('Invalid app document');
    } catch (error) {
      const saved = await cache?.match(key);
      if (saved) return saved;
      throw error;
    }
  })());
});
