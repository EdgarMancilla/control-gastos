/* Prueba el inicio de sesion sobre el index.html real, con jsdom.
   Usa la misma API de cifrado (WebCrypto) que el navegador. */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const RAIZ = require('path').join(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const codigo = require('./empaquetar.js')();

let fallos = 0;
const comprobar = (desc, cond, extra) => {
  if (!cond) fallos++;
  console.log((cond ? '  ok  ' : ' FALLA ') + desc + (extra ? '  -> ' + extra : ''));
};

function nuevaPagina() {
  const dom = new JSDOM(html, { url: 'https://local.prueba/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;

  // jsdom no trae WebCrypto: se le presta el de Node (misma API).
  Object.defineProperty(w, 'crypto', { value: globalThis.crypto, configurable: true });
  w.alert = () => {};
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {} }));

  // XLSX no hace falta para estas pruebas.
  w.XLSX = undefined;
  return { dom, w };
}

function ejecutar(w) {
  w.eval(codigo);
}

// arrancar() es async: se le da tiempo a decidir la pantalla.
const arranque = (w) => { ejecutar(w); return esperar(120); };

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function enviarAcceso(w, usuario, clave, confirma) {
  w.document.getElementById('accCorreo').value = usuario;
  w.document.getElementById('accClave').value = clave;
  if (confirma !== undefined) w.document.getElementById('accConfirma').value = confirma;

  const ev = new w.Event('submit', { bubbles: true, cancelable: true });
  w.document.getElementById('formAcceso').dispatchEvent(ev);
  await esperar(400); // PBKDF2 es asincrono
}

const visible = (w, id) => !w.document.getElementById(id).hidden;
const aviso = (w) => w.document.getElementById('accAviso').textContent;

(async () => {
  console.log('=== 1. Primera visita: debe pedir acceso ===');
  let { w } = nuevaPagina();
  await arranque(w);
  comprobar('Se muestra la pantalla de acceso', visible(w, 'pantallaAcceso'));
  comprobar('La aplicación está oculta', !visible(w, 'app'));
  comprobar('No se ven los botones de datos', !visible(w, 'btnExcel') && !visible(w, 'btnSalir'));

  console.log('\n=== 2. Validaciones al crear cuenta ===');
  w.document.querySelector('[data-modo="crear"]').dispatchEvent(new w.Event('click', { bubbles: true }));
  comprobar('Aparece el campo de confirmación', visible(w, 'grupoConfirma'));

  await enviarAcceso(w, 'noescorreo', 'secreta123', 'secreta123');
  comprobar('Rechaza correo sin formato válido', /correo válido/.test(aviso(w)), aviso(w));

  await enviarAcceso(w, 'edgar@', 'secreta123', 'secreta123');
  comprobar('Rechaza correo incompleto', /correo válido/.test(aviso(w)), aviso(w));

  await enviarAcceso(w, 'edgar@correo.com', '123', '123');
  comprobar('Rechaza contraseña corta', /al menos 6/.test(aviso(w)), aviso(w));

  await enviarAcceso(w, 'edgar@correo.com', 'secreta123', 'otracosa');
  comprobar('Rechaza confirmación distinta', /no coinciden/.test(aviso(w)), aviso(w));

  console.log('\n=== 3. Crear cuenta y entrar ===');
  await enviarAcceso(w, 'Edgar@Correo.com', 'secreta123', 'secreta123');
  comprobar('Entra tras crear la cuenta', visible(w, 'app') && !visible(w, 'pantallaAcceso'));
  comprobar('El correo se normaliza a minúsculas',
    w.document.getElementById('chipUsuario').textContent.includes('edgar@correo.com'),
    w.document.getElementById('chipUsuario').textContent);
  comprobar('Aparecen los botones de datos', visible(w, 'btnExcel') && visible(w, 'btnSalir'));

  const guardadas = JSON.parse(w.localStorage.getItem('cuentas_v2') || '{}');
  comprobar('La contraseña NO se guarda en claro',
    !JSON.stringify(guardadas).includes('secreta123'));
  comprobar('Se guarda sal + hash',
    !!guardadas['edgar@correo.com'].sal && !!guardadas['edgar@correo.com'].hash && guardadas['edgar@correo.com'].hash.length === 64);

  console.log('\n=== 4. Registrar un movimiento y comprobar que se guarda ===');
  w.document.getElementById('cantidad').value = '1500';
  w.document.getElementById('nombre').value = 'Venta de prueba';
  w.document.getElementById('fecha').value = '2026-09-30';
  w.document.getElementById('formulario').dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }));
  await esperar(50);

  const datosEdgar = JSON.parse(w.localStorage.getItem('movimientos_v2::edgar@correo.com') || '[]');
  comprobar('El movimiento queda bajo la clave del usuario', datosEdgar.length === 1,
    JSON.stringify(datosEdgar.map((m) => m.nombre)));

  console.log('\n=== 5. Salir y volver a entrar ===');
  w.document.getElementById('btnSalir').dispatchEvent(new w.Event('click', { bubbles: true }));
  await esperar(30);
  comprobar('Al salir vuelve la pantalla de acceso', visible(w, 'pantallaAcceso') && !visible(w, 'app'));
  comprobar('Se borra la sesión guardada', w.localStorage.getItem('sesion_v2') === null);

  await enviarAcceso(w, 'edgar@correo.com', 'claveMala');
  comprobar('Rechaza contraseña incorrecta',
    /incorrectos/.test(aviso(w)) && !visible(w, 'app'), aviso(w));

  await enviarAcceso(w, 'fantasma@correo.com', 'loquesea');
  comprobar('Usuario inexistente da el MISMO mensaje (no delata cuentas)',
    /incorrectos/.test(aviso(w)), aviso(w));

  await enviarAcceso(w, 'edgar@correo.com', 'secreta123');
  comprobar('Entra con la contraseña correcta', visible(w, 'app'));
  comprobar('Recupera sus movimientos',
    w.document.querySelectorAll('.movimiento').length === 1,
    w.document.querySelectorAll('.movimiento').length + ' movimientos en pantalla');

  console.log('\n=== 6. Dos cuentas no se mezclan ===');
  w.document.getElementById('btnSalir').dispatchEvent(new w.Event('click', { bubbles: true }));
  await esperar(30);
  w.document.querySelector('[data-modo="crear"]').dispatchEvent(new w.Event('click', { bubbles: true }));
  await enviarAcceso(w, 'maria@correo.com', 'otraclave9', 'otraclave9');
  comprobar('La segunda cuenta entra', visible(w, 'app'));
  comprobar('María NO ve los movimientos de Edgar',
    w.document.querySelectorAll('.movimiento').length === 0,
    w.document.querySelectorAll('.movimiento').length + ' movimientos en pantalla');

  w.document.getElementById('cantidad').value = '77';
  w.document.getElementById('nombre').value = 'Gasto de María';
  w.document.getElementById('fecha').value = '2026-09-30';
  w.document.getElementById('formulario').dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }));
  await esperar(50);

  comprobar('Los datos de Edgar siguen intactos',
    JSON.parse(w.localStorage.getItem('movimientos_v2::edgar@correo.com')).length === 1);
  comprobar('Los datos de María van aparte',
    JSON.parse(w.localStorage.getItem('movimientos_v2::maria@correo.com')).length === 1);

  console.log('\n=== 7. La sesión sobrevive al recargar ===');
  const copia = { ...w.localStorage };
  const pagina2 = nuevaPagina();
  Object.keys(copia).forEach((k) => pagina2.w.localStorage.setItem(k, copia[k]));
  await arranque(pagina2.w);
  comprobar('Reabre directo en la app, sin volver a pedir contraseña',
    visible(pagina2.w, 'app') && !visible(pagina2.w, 'pantallaAcceso'));
  comprobar('Reabre con la cuenta correcta',
    pagina2.w.document.getElementById('chipUsuario').textContent.includes('maria@correo.com'),
    pagina2.w.document.getElementById('chipUsuario').textContent);

  console.log('\n=== 8. Migración de los datos anteriores a las cuentas ===');
  const pagina3 = nuevaPagina();
  pagina3.w.localStorage.setItem('movimientos_v1', JSON.stringify([
    { id: 1, tipo: 'ingreso', cantidad: 100, fecha: '2026-09-01', nombre: 'Viejo 1' },
    { id: 2, tipo: 'gasto', cantidad: 40, fecha: '2026-09-02', categoria: 'comida',
      nombre: 'Viejo 2', motivo: 'prueba' },
  ]));
  await arranque(pagina3.w);
  pagina3.w.document.querySelector('[data-modo="crear"]')
    .dispatchEvent(new pagina3.w.Event('click', { bubbles: true }));
  await enviarAcceso(pagina3.w, 'primero@correo.com', 'clave12345', 'clave12345');
  comprobar('La primera cuenta hereda los movimientos previos',
    pagina3.w.document.querySelectorAll('.movimiento').length === 2,
    pagina3.w.document.querySelectorAll('.movimiento').length + ' movimientos');

  console.log('\n' + (fallos === 0 ? 'TODO BIEN: 0 fallos' : 'FALLOS: ' + fallos));
  process.exit(fallos === 0 ? 0 : 1);
})();
