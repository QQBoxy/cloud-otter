self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET') return

  // Always go through the Worker for session checks. Store no pages or API responses.
  event.respondWith(fetch(event.request).catch(() => new Response(`<!doctype html>
<html lang="zh-Hant-TW">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>海獺公告欄 · 無法連線</title>
  </head>
  <body>
    <main>
      <h1>無法連線</h1>
      <p>請確認網路連線後，再試一次。</p>
      <a href="/">重新開啟公告欄</a>
    </main>
  </body>
</html>`, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })))
})
