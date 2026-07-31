// FinWise AI Service Worker - Self-unregistering
// This SW unregisters itself and clears all caches to fix DataCloneError
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => {
        console.log('[SW] Deleting cache:', key);
        return caches.delete(key);
      })))
      .then(() => {
        console.log('[SW] All caches cleared. Unregistering SW...');
        return self.registration.unregister();
      })
      .then(() => self.clients.matchAll())
      .then(clients => clients.forEach(client => client.postMessage({ type: 'SW_UNREGISTERED' })))
  );
});
