'use strict';

/*
  Change VERSION whenever you update the app files.

  Example:
    v1 → v2 → v3

  This gives updated files a fresh offline cache.
*/

const VERSION = 'v1';

const CACHE_PREFIX =
  'the-ladder-complete-' +
  new URL(self.registration.scope).pathname +
  '-';

const CACHE_NAME = CACHE_PREFIX + VERSION;

const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key =>
            key.startsWith(CACHE_PREFIX) &&
            key !== CACHE_NAME
          )
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);

  if(request.method !== 'GET') return;
  if(url.origin !== scope.origin) return;
  if(!url.pathname.startsWith(scope.pathname)) return;

  /*
    HTML: network first so a normal online refresh can get
    the current page. Offline: use the cached page.
  */
  if(request.mode === 'navigate'){
    event.respondWith((async () => {
      try{
        const response = await fetch(request);

        if(response.ok){
          const cache = await caches.open(CACHE_NAME);
          await cache.put('./index.html', response.clone());
          return response;
        }

        const cached = await caches.match('./index.html');

        return cached || response;
      }catch(error){
        const cached = await caches.match('./index.html');

        return cached || new Response(
          'Open The Ladder online once to enable offline access.',
          {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          }
        );
      }
    })());

    return;
  }

  /*
    Assets: use the current version's cache first.
    Updating VERSION installs a fresh set.
  */
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if(cached) return cached;

    const response = await fetch(request);

    if(response.ok){
      await cache.put(request, response.clone());
    }

    return response;
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for(const client of windows){
      if(client.url.startsWith(self.registration.scope)){
        await client.focus();
        return;
      }
    }

    await self.clients.openWindow('./index.html');
  })());
});