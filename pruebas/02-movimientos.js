/* Prueba la edición de movimientos y el filtro por mes sobre el
   index.html real, en modo local. */

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

function nuevaPagina() {
  const dom = new JSDOM(html, {
    url: 'https://local.prueba/', pretendToBeVisual: true, runScripts: 'outside-only',
  });
  const w = dom.window;
  Object.defineProperty(w, 'crypto', { value: globalThis.crypto, configurable: true });
  w.alert = (m) => { console.log('    [alert] ' + m); };
  w.confirm = () => true;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  return w;
}

const $ = (w, id) => w.document.getElementById(id);
const texto = (w, id) => $(w, id).textContent;

async function enviarForm(w, idForm) {
  $(w, idForm).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await esperar(80);
}

async function capturar(w, { tipo, cantidad, nombre, fecha, categoria, motivo }) {
  w.document.querySelector(`#segmento .seg-opcion[data-tipo="${tipo}"]`)
    .dispatchEvent(new w.Event('click', { bubbles: true }));
  $(w, 'cantidad').value = String(cantidad);
  $(w, 'nombre').value = nombre;
  $(w, 'fecha').value = fecha;
  if (tipo === 'gasto') {
    if (categoria) {
      w.document.querySelector(`#fichas .ficha[data-id="${categoria}"]`)
        .dispatchEvent(new w.Event('click', { bubbles: true }));
    }
    $(w, 'motivo').value = motivo || 'motivo de prueba';
  }
  await enviarForm(w, 'formulario');
}

const filas = (w) => [...w.document.querySelectorAll('.movimiento')];
const nombres = (w) => filas(w).map((f) => f.querySelector('.mov-nombre').textContent);

(async () => {
  const w = nuevaPagina();
  w.eval(codigo);
  await esperar(120);

  // Crear cuenta para entrar
  w.document.querySelector('[data-modo="crear"]').dispatchEvent(new w.Event('click', { bubbles: true }));
  $(w, 'accCorreo').value = 'prueba@correo.com';
  $(w, 'accClave').value = 'clave12345';
  $(w, 'accConfirma').value = 'clave12345';
  await enviarForm(w, 'formAcceso');
  await esperar(350);
  comprobar('Entra en la aplicación', !$(w, 'app').hidden);

  console.log('\n=== Captura de movimientos en dos meses ===');
  await capturar(w, { tipo: 'ingreso', cantidad: 10000, nombre: 'Venta agosto', fecha: '2026-08-10' });
  await capturar(w, { tipo: 'gasto', cantidad: 2000, nombre: 'Renta agosto', fecha: '2026-08-15',
    categoria: 'servicios', motivo: 'renta del local' });
  await capturar(w, { tipo: 'ingreso', cantidad: 5000, nombre: 'Venta septiembre', fecha: '2026-09-05' });
  await capturar(w, { tipo: 'gasto', cantidad: 800, nombre: 'Gasolina', fecha: '2026-09-07',
    categoria: 'transporte', motivo: 'entregas' });

  comprobar('Se registran los 4 movimientos', filas(w).length === 4, filas(w).length);
  comprobar('Saldo total correcto (15000-2800)', texto(w, 'saldoTotal').includes('12,200'),
    texto(w, 'saldoTotal'));

  console.log('\n=== Filtro por mes ===');
  const opciones = [...$(w, 'selectorMes').options].map((o) => o.value);
  comprobar('El selector ofrece los dos meses y "todos"',
    opciones.length === 3 && opciones.includes('2026-08') && opciones.includes('2026-09'),
    opciones.join(', '));
  comprobar('El mes más reciente aparece primero', opciones[1] === '2026-09', opciones[1]);

  $(w, 'selectorMes').value = '2026-09';
  $(w, 'selectorMes').dispatchEvent(new w.Event('change', { bubbles: true }));
  await esperar(60);

  comprobar('Solo se ven los movimientos de septiembre', filas(w).length === 2, nombres(w).join(', '));
  comprobar('La cifra pasa a ser el balance del mes (5000-800)',
    texto(w, 'saldoTotal').includes('4,200'), texto(w, 'saldoTotal'));
  comprobar('La etiqueta nombra el mes',
    /septiembre/i.test(texto(w, 'etiquetaCifra')), texto(w, 'etiquetaCifra'));
  comprobar('Se muestra aparte el saldo total', !$(w, 'parSaldoTotal').hidden &&
    texto(w, 'saldoGeneral').includes('12,200'), texto(w, 'saldoGeneral'));
  comprobar('Entró/Salió corresponden al mes',
    texto(w, 'totalIngresos').includes('5,000') && texto(w, 'totalGastos').includes('800'),
    texto(w, 'totalIngresos') + ' / ' + texto(w, 'totalGastos'));

  const barras = [...w.document.querySelectorAll('.barra-nombre')].map((b) => b.textContent);
  comprobar('La gráfica solo muestra secciones del mes',
    barras.length === 1 && /Transporte/.test(barras[0]), barras.join(', '));

  console.log('\n=== Edición de un movimiento ===');
  $(w, 'selectorMes').value = 'todos';
  $(w, 'selectorMes').dispatchEvent(new w.Event('change', { bubbles: true }));
  await esperar(60);

  const fila = filas(w).find((f) => f.querySelector('.mov-nombre').textContent === 'Gasolina');
  fila.querySelector('.mov-accion').dispatchEvent(new w.Event('click', { bubbles: true }));
  await esperar(60);

  comprobar('Aparece el aviso de edición', !$(w, 'avisoEdicion').hidden);
  comprobar('El formulario se rellena con los datos', $(w, 'cantidad').value === '800' &&
    $(w, 'nombre').value === 'Gasolina' && $(w, 'motivo').value === 'entregas',
    $(w, 'cantidad').value + ' / ' + $(w, 'nombre').value + ' / ' + $(w, 'motivo').value);
  comprobar('Recupera la sección correcta',
    w.document.querySelector('#fichas .ficha.activa').dataset.id === 'transporte',
    w.document.querySelector('#fichas .ficha.activa').dataset.id);
  comprobar('El botón dice "Guardar cambios"',
    texto(w, 'botonGuardar') === 'Guardar cambios', texto(w, 'botonGuardar'));
  comprobar('La fila editada queda señalada',
    w.document.querySelectorAll('.movimiento.en-edicion').length === 1);

  // Cambiar la cantidad y guardar
  $(w, 'cantidad').value = '1250';
  $(w, 'motivo').value = 'entregas de toda la semana';
  await enviarForm(w, 'formulario');
  await esperar(80);

  comprobar('No se duplicó el movimiento', filas(w).length === 4, filas(w).length);
  const editado = w.document.querySelector('.movimiento.gasto .mov-monto');
  comprobar('La cantidad quedó actualizada',
    nombres(w).includes('Gasolina') && texto(w, 'saldoTotal').includes('11,750'),
    texto(w, 'saldoTotal'));
  comprobar('El aviso de edición se cerró', $(w, 'avisoEdicion').hidden);
  comprobar('El botón vuelve a su texto normal',
    texto(w, 'botonGuardar') === 'Registrar entrada', texto(w, 'botonGuardar'));

  const guardados = JSON.parse(w.localStorage.getItem('movimientos_v2::prueba@correo.com'));
  const gasolina = guardados.find((m) => m.nombre === 'Gasolina');
  comprobar('Se guardó en el almacén, no solo en pantalla',
    gasolina && gasolina.cantidad === 1250 && gasolina.motivo === 'entregas de toda la semana',
    gasolina ? gasolina.cantidad + ' / ' + gasolina.motivo : 'no encontrado');
  comprobar('Hay exactamente un registro de ese movimiento',
    guardados.filter((m) => m.nombre === 'Gasolina').length === 1);

  console.log('\n=== Cambiar una salida a entrada ===');
  const filaRenta = filas(w).find((f) => f.querySelector('.mov-nombre').textContent === 'Renta agosto');
  filaRenta.querySelector('.mov-accion').dispatchEvent(new w.Event('click', { bubbles: true }));
  await esperar(60);
  w.document.querySelector('#segmento .seg-opcion[data-tipo="ingreso"]')
    .dispatchEvent(new w.Event('click', { bubbles: true }));
  comprobar('Al cambiar de tipo sigue diciendo "Guardar cambios"',
    texto(w, 'botonGuardar') === 'Guardar cambios', texto(w, 'botonGuardar'));

  await enviarForm(w, 'formulario');
  await esperar(80);

  const tras = JSON.parse(w.localStorage.getItem('movimientos_v2::prueba@correo.com'));
  const renta = tras.find((m) => m.nombre === 'Renta agosto');
  comprobar('Ahora es una entrada', renta.tipo === 'ingreso', renta.tipo);
  comprobar('Ya no arrastra categoría ni motivo de cuando era salida',
    renta.categoria === undefined && renta.motivo === undefined,
    'categoria=' + renta.categoria + ' motivo=' + renta.motivo);

  console.log('\n=== Cancelar una edición ===');
  filas(w)[0].querySelector('.mov-accion').dispatchEvent(new w.Event('click', { bubbles: true }));
  await esperar(50);
  const antes = filas(w).length;
  $(w, 'btnCancelarEdicion').dispatchEvent(new w.Event('click', { bubbles: true }));
  await esperar(50);
  comprobar('Se cierra el aviso', $(w, 'avisoEdicion').hidden);
  comprobar('No cambió nada', filas(w).length === antes);
  comprobar('El formulario queda limpio', $(w, 'cantidad').value === '');

  console.log('\n' + (fallos === 0 ? 'TODO BIEN: 0 fallos' : 'FALLOS: ' + fallos));
  process.exit(fallos === 0 ? 0 : 1);
})();
