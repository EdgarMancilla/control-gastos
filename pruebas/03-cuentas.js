/* Prueba las cuentas de dinero, los traspasos y los saldos. */

const fs = require('fs');
const { JSDOM } = require('jsdom');

const RAIZ = require('path').join(__dirname, '..');
const html = fs.readFileSync(RAIZ + '/index.html', 'utf8');
const codigo = require('./empaquetar.js')();

let fallos = 0;
const comprobar = (desc, cond, extra) => {
  if (!cond) fallos++;
  console.log((cond ? '  ok  ' : ' FALLA ') + desc + (extra !== undefined ? '  -> ' + extra : ''));
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function nuevaPagina(previos) {
  const dom = new JSDOM(html, {
    url: 'https://local.prueba/', pretendToBeVisual: true, runScripts: 'outside-only',
  });
  const w = dom.window;
  Object.defineProperty(w, 'crypto', { value: globalThis.crypto, configurable: true });
  w.alert = (m) => { ultimoAviso = m; };
  w.confirm = () => true;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  if (previos) Object.keys(previos).forEach((k) => w.localStorage.setItem(k, previos[k]));
  return w;
}

let ultimoAviso = '';
const $ = (w, id) => w.document.getElementById(id);
const texto = (w, id) => $(w, id).textContent;
const clic = (w, el) => el.dispatchEvent(new w.Event('click', { bubbles: true }));

async function enviar(w, idForm) {
  $(w, idForm).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await esperar(70);
}

async function crearCuenta(w, nombre, tipo, saldo) {
  clic(w, $(w, 'btnNuevaCuenta'));
  $(w, 'cuentaNombre').value = nombre;
  $(w, 'cuentaTipo').value = tipo;
  $(w, 'cuentaSaldo').value = String(saldo);
  await enviar(w, 'formCuenta');
}

async function capturar(w, { tipo, cantidad, nombre, fecha, cuenta, categoria, motivo, origen, destino }) {
  clic(w, w.document.querySelector(`#segmento .seg-opcion[data-tipo="${tipo}"]`));
  $(w, 'cantidad').value = String(cantidad);
  $(w, 'nombre').value = nombre || '';
  $(w, 'fecha').value = fecha;

  if (tipo === 'transferencia') {
    $(w, 'traspasoOrigen').value = origen;
    $(w, 'traspasoDestino').value = destino;
  } else {
    if (cuenta) clic(w, w.document.querySelector(`.ficha[data-cuenta="${cuenta}"]`));
    if (tipo === 'gasto') {
      if (categoria) clic(w, w.document.querySelector(`#fichas .ficha[data-id="${categoria}"]`));
      $(w, 'motivo').value = motivo || 'motivo';
    }
  }
  await enviar(w, 'formulario');
}

const idDeCuenta = (w, nombre) => {
  const fichas = [...w.document.querySelectorAll('#fichasCuenta .ficha')];
  const f = fichas.find((x) => x.textContent.includes(nombre));
  return f ? f.dataset.cuenta : null;
};

const saldos = (w) => [...w.document.querySelectorAll('.cuenta-fila')].map((f) => ({
  nombre: f.querySelector('.cuenta-nombre').textContent.trim(),
  saldo: f.querySelector('.cuenta-saldo').textContent,
}));

(async () => {
  const w = nuevaPagina();
  w.eval(codigo);
  await esperar(120);

  w.document.querySelector('[data-modo="crear"]').dispatchEvent(new w.Event('click', { bubbles: true }));
  $(w, 'accCorreo').value = 'cuentas@correo.com';
  $(w, 'accClave').value = 'clave12345';
  $(w, 'accConfirma').value = 'clave12345';
  await enviar(w, 'formAcceso');
  await esperar(400);

  console.log('=== Cuenta por defecto ===');
  comprobar('Se crea "Efectivo" automáticamente',
    saldos(w).length === 1 && /Efectivo/.test(saldos(w)[0].nombre), JSON.stringify(saldos(w)));
  comprobar('El aviso de "sin cuentas" está oculto', $(w, 'sinCuentas').hidden);

  console.log('\n=== Crear cuentas con saldo inicial ===');
  await crearCuenta(w, 'BBVA', 'banco', 5000);
  await crearCuenta(w, 'Santander', 'banco', 1200.5);
  comprobar('Hay tres cuentas', saldos(w).length === 3, saldos(w).map((s) => s.nombre).join(', '));
  comprobar('El saldo inicial se refleja',
    saldos(w).find((s) => /BBVA/.test(s.nombre)).saldo.includes('5,000'),
    JSON.stringify(saldos(w)));

  const efectivo = idDeCuenta(w, 'Efectivo');
  const bbva = idDeCuenta(w, 'BBVA');
  const santander = idDeCuenta(w, 'Santander');

  console.log('\n=== Entradas y salidas afectan a su cuenta ===');
  await capturar(w, { tipo: 'ingreso', cantidad: 3000, nombre: 'Venta', fecha: '2026-10-01', cuenta: bbva });
  await capturar(w, { tipo: 'gasto', cantidad: 500, nombre: 'Súper', fecha: '2026-10-01',
    cuenta: efectivo, categoria: 'comida', motivo: 'despensa' });

  const s1 = saldos(w);
  comprobar('BBVA sube con la entrada (5000+3000)',
    s1.find((s) => /BBVA/.test(s.nombre)).saldo.includes('8,000'), JSON.stringify(s1));
  comprobar('Efectivo baja con la salida (0-500)',
    s1.find((s) => /Efectivo/.test(s.nombre)).saldo.includes('-$500'), JSON.stringify(s1));
  comprobar('El saldo total suma todas las cuentas (8000-500+1200.50)',
    texto(w, 'saldoTotal').includes('8,700.50'), texto(w, 'saldoTotal'));

  console.log('\n=== Traspaso entre cuentas ===');
  await capturar(w, { tipo: 'transferencia', cantidad: 2000, nombre: 'Retiro',
    fecha: '2026-10-02', origen: bbva, destino: efectivo });

  const s2 = saldos(w);
  comprobar('Sale de BBVA (8000-2000)',
    s2.find((s) => /BBVA/.test(s.nombre)).saldo.includes('6,000'), JSON.stringify(s2));
  comprobar('Entra a Efectivo (-500+2000)',
    s2.find((s) => /Efectivo/.test(s.nombre)).saldo.includes('1,500'), JSON.stringify(s2));
  comprobar('El saldo TOTAL no cambia: el dinero solo se movió',
    texto(w, 'saldoTotal').includes('8,700.50'), texto(w, 'saldoTotal'));
  comprobar('El traspaso NO cuenta como entrada ni salida',
    texto(w, 'totalIngresos').includes('3,000') && texto(w, 'totalGastos').includes('500'),
    texto(w, 'totalIngresos') + ' / ' + texto(w, 'totalGastos'));

  console.log('\n=== Validaciones del traspaso ===');
  ultimoAviso = '';
  await capturar(w, { tipo: 'transferencia', cantidad: 100, nombre: 'Malo',
    fecha: '2026-10-02', origen: bbva, destino: bbva });
  comprobar('Rechaza traspaso a la misma cuenta', /distinta/.test(ultimoAviso), ultimoAviso);

  console.log('\n=== Filtro por cuenta ===');
  $(w, 'selectorCuenta').value = bbva;
  $(w, 'selectorCuenta').dispatchEvent(new w.Event('change', { bubbles: true }));
  await esperar(60);

  comprobar('La cifra pasa a ser el saldo de esa cuenta',
    texto(w, 'saldoTotal').includes('6,000'), texto(w, 'saldoTotal'));
  comprobar('La etiqueta nombra la cuenta',
    /BBVA/.test(texto(w, 'etiquetaCifra')), texto(w, 'etiquetaCifra'));
  comprobar('Se sigue viendo el total aparte',
    !$(w, 'parSaldoTotal').hidden && texto(w, 'saldoGeneral').includes('8,700.50'),
    texto(w, 'saldoGeneral'));

  const vistos = [...w.document.querySelectorAll('.movimiento .mov-nombre')].map((n) => n.textContent);
  comprobar('Solo los movimientos de esa cuenta, traspaso incluido',
    vistos.length === 2 && vistos.includes('Venta') && vistos.includes('Retiro'),
    vistos.join(', '));

  $(w, 'selectorCuenta').value = 'todas';
  $(w, 'selectorCuenta').dispatchEvent(new w.Event('change', { bubbles: true }));
  await esperar(60);

  console.log('\n=== Editar un traspaso ===');
  const filaRetiro = [...w.document.querySelectorAll('.movimiento')]
    .find((f) => f.querySelector('.mov-nombre').textContent === 'Retiro');
  comprobar('El traspaso se muestra con las dos cuentas',
    /BBVA.*→.*Efectivo/.test(filaRetiro.querySelector('.mov-seccion').textContent),
    filaRetiro.querySelector('.mov-seccion').textContent);

  clic(w, filaRetiro.querySelector('.mov-accion'));
  await esperar(60);
  comprobar('Recupera origen y destino',
    $(w, 'traspasoOrigen').value === bbva && $(w, 'traspasoDestino').value === efectivo);

  $(w, 'cantidad').value = '2500';
  await enviar(w, 'formulario');
  const s3 = saldos(w);
  comprobar('Al cambiar el monto se recalculan las dos cuentas',
    s3.find((s) => /BBVA/.test(s.nombre)).saldo.includes('5,500') &&
    s3.find((s) => /Efectivo/.test(s.nombre)).saldo.includes('2,000'), JSON.stringify(s3));

  console.log('\n=== Eliminar una cuenta deja los movimientos ===');
  const antes = w.document.querySelectorAll('.movimiento').length;
  const filaSantander = [...w.document.querySelectorAll('.cuenta-fila')]
    .find((f) => /Santander/.test(f.textContent));
  clic(w, filaSantander.querySelectorAll('.mov-accion')[1]);
  await esperar(70);
  comprobar('Queda una cuenta menos', saldos(w).length === 2, saldos(w).map((s) => s.nombre).join(', '));
  comprobar('Los movimientos no se borran',
    w.document.querySelectorAll('.movimiento').length === antes);

  console.log('\n=== Movimientos antiguos sin cuenta ===');
  const previos = { ...w.localStorage };
  const datos = JSON.parse(previos['movimientos_v2::cuentas@correo.com']);
  datos.push({ id: 'viejo1', tipo: 'ingreso', cantidad: 777, fecha: '2026-07-01',
    nombre: 'De antes', registrado: '2026-07-01T10:00:00' });
  previos['movimientos_v2::cuentas@correo.com'] = JSON.stringify(datos);

  const w2 = nuevaPagina(previos);
  w2.eval(codigo);
  await esperar(400);

  comprobar('Avisa de los movimientos sin cuenta', !$(w2, 'avisoSinAsignar').hidden);
  comprobar('Dice cuántos son', /1 movimiento /.test(texto(w2, 'textoSinAsignar')),
    texto(w2, 'textoSinAsignar'));

  const bbva2 = idDeCuenta(w2, 'BBVA');
  $(w2, 'cuentaDestinoAsignar').value = bbva2;
  clic(w2, $(w2, 'btnAsignar'));
  await esperar(300);

  comprobar('Tras asignarlos, el aviso desaparece', $(w2, 'avisoSinAsignar').hidden);
  const guardados = JSON.parse(w2.localStorage.getItem('movimientos_v2::cuentas@correo.com'));
  comprobar('El movimiento antiguo quedó con cuenta',
    guardados.find((m) => m.id === 'viejo1').cuenta === bbva2,
    guardados.find((m) => m.id === 'viejo1').cuenta);

  console.log('\n' + (fallos === 0 ? 'TODO BIEN: 0 fallos' : 'FALLOS: ' + fallos));
  process.exit(fallos === 0 ? 0 : 1);
})();
