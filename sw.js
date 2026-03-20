const CACHE_NAME = "financas-v1";

// Arquivos que ficam salvos localmente
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"
];

// Instala o service worker e salva os arquivos no cache
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Remove caches antigos quando atualizar
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estratégia: tenta buscar da internet primeiro, se falhar usa o cache
// Para o Supabase (API), sempre tenta a internet — nunca cacheia dados
self.addEventListener("fetch", event => {
  const url = event.request.url;

  // Nunca cacheia chamadas de API do Supabase
  if (url.includes("supabase.co/rest") || url.includes("supabase.co/auth")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Para os demais arquivos: rede primeiro, cache como fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Atualiza o cache com a versão mais recente
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
