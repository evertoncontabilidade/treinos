// Service worker do Treino do Dia.
// - Arquivos do próprio app: abrem na hora do cache e se atualizam em segundo plano.
// - Biblioteca do Supabase (CDN): guardada no primeiro uso.
// - Chamadas ao Supabase (dados): nunca passam pelo cache. O app guarda o que precisa por conta própria.
//
// IMPORTANTE: a cada publicação nova, aumente o número em VERSAO para limpar o cache antigo.
const VERSAO = 'v1';
const CACHE = `treino-do-dia-${VERSAO}`;

const ARQUIVOS = [
  './',
  'index.html',
  'aluno.html',
  'admin.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/supabase.js',
  'js/ui.js',
  'js/auth.js',
  'js/login.js',
  'js/aluno.js',
  'js/admin.js',
  'js/timer.js',
  'js/fila.js',
  'js/ordenavel.js',
  'js/pwa.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Biblioteca no CDN: cache primeiro
  if (url.hostname === 'cdn.jsdelivr.net') {
    evento.respondWith(
      caches.match(req).then((guardado) => guardado || fetch(req).then((resp) => {
        if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return resp;
      })),
    );
    return;
  }

  // Só o que é do próprio app entra no cache
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const guardado = await cache.match(req, { ignoreSearch: true });
      const rede = fetch(req).then((resp) => {
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
      }).catch(() => null);

      if (guardado) { rede.catch(() => {}); return guardado; }
      const resp = await rede;
      if (resp) return resp;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }),
  );
});
