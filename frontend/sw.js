// Service worker mínimo (placeholder PWA, sem cache para evitar conteúdo velho).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
