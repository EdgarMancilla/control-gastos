/* Comprueba que el service worker no se mete donde no debe.
   Un error aquí rompe el inicio de sesión o la sincronización de datos
   sin que nada falle de forma evidente, así que conviene vigilarlo. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');

let fallos = 0;
const comprobar = (desc, cond, extra) => {
  if (!cond) fallos++;
  console.log((cond ? '  ok  ' : ' FALLA ') + desc + (extra !== undefined ? '  -> ' + extra : ''));
};

/* Se carga sw.js en un entorno falso y se capturan sus manejadores. */
function cargarServiceWorker() {
  const manejadores = {};
  const contexto = {
    self: {
      addEventListener: (evento, fn) => { manejadores[evento] = fn; },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: {
      open: () => Promise.resolve({ add: () => Promise.resolve(), put: () => {}, keys: () => Promise.resolve([]) }),
      keys: () => Promise.resolve([]),
      match: () => Promise.resolve(undefined),
      delete: () => Promise.resolve(true),
    },
    fetch: () => Promise.resolve({ status: 200, clone: () => ({}), type: 'basic' }),
    location: new URL('https://edgarmancilla.github.io/control-gastos/sw.js'),
    URL,
    Promise,
    console,
  };
  contexto.self.location = contexto.location;
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8'), contexto);
  return manejadores;
}

/* Simula una petición y dice si el service worker la intercepta. */
function intercepta(manejadorFetch, url, modo = 'cors', metodo = 'GET') {
  let interceptada = false;
  manejadorFetch({
    request: { url, method: metodo, mode: modo },
    respondWith: () => { interceptada = true; },
  });
  return interceptada;
}

const manejadores = cargarServiceWorker();

console.log('=== El service worker se instala correctamente ===');
comprobar('Registra manejador de instalación', typeof manejadores.install === 'function');
comprobar('Registra manejador de activación', typeof manejadores.activate === 'function');
comprobar('Registra manejador de peticiones', typeof manejadores.fetch === 'function');
comprobar('Escucha el aviso para actualizar', typeof manejadores.message === 'function');

const f = manejadores.fetch;

console.log('\n=== NO debe tocar el tráfico de Firebase ===');
const DE_FIREBASE = [
  ['Inicio de sesión', 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIza'],
  ['Renovación del token', 'https://securetoken.googleapis.com/v1/token?key=AIza'],
  ['Lectura de Firestore', 'https://firestore.googleapis.com/v1/projects/control-gastos-769cb/databases/(default)/documents'],
  ['Canal en vivo de Firestore', 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel'],
  ['Dominio del proyecto', 'https://control-gastos-769cb.firebaseapp.com/__/auth/iframe'],
];
DE_FIREBASE.forEach(([que, url]) => {
  comprobar('Deja pasar: ' + que, !intercepta(f, url));
});

console.log('\n=== SÍ debe guardar las librerías (su dirección lleva la versión) ===');
[
  ['SDK de Firebase', 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js'],
  ['Generador de Excel', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'],
].forEach(([que, url]) => {
  comprobar('Guarda: ' + que, intercepta(f, url));
});

console.log('\n=== Archivos propios ===');
comprobar('Guarda la hoja de estilos',
  intercepta(f, 'https://edgarmancilla.github.io/control-gastos/estilos.css'));
comprobar('Guarda el código de la app',
  intercepta(f, 'https://edgarmancilla.github.io/control-gastos/app.js'));
comprobar('Atiende la página (para abrir sin conexión)',
  intercepta(f, 'https://edgarmancilla.github.io/control-gastos/', 'navigate'));

console.log('\n=== Nunca toca lo que no es una lectura ===');
comprobar('Ignora los envíos (POST)',
  !intercepta(f, 'https://edgarmancilla.github.io/control-gastos/app.js', 'cors', 'POST'));

console.log('\n=== El manifiesto declara lo necesario para instalarse ===');
const manifiesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'));
comprobar('Abre sin barra del navegador', manifiesto.display === 'standalone', manifiesto.display);
comprobar('Rutas relativas (funciona en un subdirectorio)',
  manifiesto.start_url.startsWith('.') && manifiesto.scope.startsWith('.'),
  manifiesto.start_url + ' / ' + manifiesto.scope);
comprobar('Tiene icono recortable para Android',
  manifiesto.icons.some((i) => i.purpose === 'maskable'));
comprobar('Los iconos declarados existen',
  manifiesto.icons.every((i) => fs.existsSync(path.join(RAIZ, i.src))),
  manifiesto.icons.map((i) => i.src).join(', '));

console.log('\n' + (fallos === 0 ? 'TODO BIEN: 0 fallos' : 'FALLOS: ' + fallos));
process.exit(fallos === 0 ? 0 : 1);
