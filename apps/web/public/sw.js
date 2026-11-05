self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate')
    e.respondWith(
      fetch(e.request).catch(
        () =>
          new Response(
            '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Little Days</title><body><h1>Bạn đang ngoại tuyến</h1><p>Kết nối mạng để mở kỉ niệm riêng tư.</p><a href="/today">Thử lại</a></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          ),
      ),
    );
});
