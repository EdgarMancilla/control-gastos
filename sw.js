/* ===== Service worker =====
   Lo que permite que la app abra sin conexión y se comporte como una
   app instalada.

   La trampa clásica de estos archivos es guardar una versión vieja y
   servirla para siempre: publicas una corrección y nadie la ve. Para
   evitarlo, cada tipo de archivo se trata distinto:

     - La página (HTML)  -> SIEMPRE se pide a la red primero.
                            La copia guardada solo entra si no hay señal.
     - CSS y JS propios  -> se sirve la copia guardada (rápido) y se
                            baja la nueva en segundo plano para la
                            próxima vez. Si hay una nueva, la app avisa.
     - Librerías del CDN -> copia guardada sin más: sus direcciones
                            llevan el número de versión, así que una
                            dirección concreta nunca cambia.
     - Firebase (datos)  -> no se toca. Firestore tiene su propia caché
                            y entrometerse rompería la sincronización.

   Al cambiar archivos, sube el número de VERSION para que las copias
   viejas se borren. */

const VERSION = 'v1';
const CACHE = 'control-gastos-' + VERSION;

// Lo mínimo para que la app abra sin conexión.
const ESENCIALES = [
  './',
  './index.html',
  './estilos.css',
  './app.js',
  './almacen.js',
  './firebase-config.js',
  './favicon.svg',
  './icono-192.png',
  './manifest.json',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      // addAll falla entero si un archivo falla; se guardan de uno en
      // uno para que un fallo suelto no impida la instalación.
      .then((cache) => Promise.allSettled(ESENCIALES.map((u) => cache.add(u))))
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres.filter((n) => n.startsWith('control-gastos-') && n !== CACHE)
          .map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// La app pide tomar el control cuando el usuario acepta actualizar.
self.addEventListener('message', (evento) => {
  if (evento.data === 'ACTUALIZAR') self.skipWaiting();
});

/* Direcciones que NUNCA se interceptan: son los datos en vivo. */
const ES_FIREBASE = (url) =>
  url.hostname.endsWith('googleapis.com') ||
  url.hostname.endsWith('firebaseio.com') ||
  url.hostname.endsWith('firebaseapp.com');

/* Librerías con la versión en la dirección: se pueden guardar sin miedo. */
const ES_LIBRERIA = (url) =>
  url.hostname === 'www.gstatic.com' || url.hostname === 'cdnjs.cloudflare.com';

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  if (ES_FIREBASE(url)) return;

  // La página: red primero, para no quedarse con una versión vieja.
  if (peticion.mode === 'navigate') {
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => {
          guardar(peticion, respuesta.clone());
          return respuesta;
        })
        .catch(() => caches.match(peticion)
          .then((guardada) => guardada || caches.match('./index.html')))
    );
    return;
  }

  if (ES_LIBRERIA(url)) {
    evento.respondWith(
      caches.match(peticion).then((guardada) => guardada || fetch(peticion)
        .then((respuesta) => {
          guardar(peticion, respuesta.clone());
          return respuesta;
        }))
    );
    return;
  }

  // Archivos propios: se sirve lo guardado y se refresca por detrás.
  if (url.origin === location.origin) {
    evento.respondWith(
      caches.match(peticion).then((guardada) => {
        const deLaRed = fetch(peticion)
          .then((respuesta) => {
            guardar(peticion, respuesta.clone());
            return respuesta;
          })
          .catch(() => guardada);
        return guardada || deLaRed;
      })
    );
  }
});

function guardar(peticion, respuesta) {
  // Solo respuestas correctas; una página de error guardada sería peor
  // que no tener nada.
  if (!respuesta || respuesta.status !== 200 || respuesta.type === 'error') return;
  caches.open(CACHE).then((cache) => cache.put(peticion, respuesta));
}
