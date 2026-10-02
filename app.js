/* ===== Control de gastos =====
   Dónde se guardan las cuentas y los movimientos lo decide
   almacen.js: aquí solo se le pide, sin saber si detrás hay
   Firebase o el navegador. */

import { crearAlmacen, revisarCredenciales } from './almacen.js';

let almacen = null;

const CATEGORIAS = [
  { id: 'comida',     nombre: 'Comida y despensa', icono: '🍔' },
  { id: 'transporte', nombre: 'Transporte',        icono: '🚗' },
  { id: 'servicios',  nombre: 'Servicios y renta', icono: '🏠' },
  { id: 'salud',      nombre: 'Salud',             icono: '💊' },
  { id: 'insumos',    nombre: 'Insumos / negocio', icono: '📦' },
  { id: 'personal',   nombre: 'Personal / ocio',   icono: '🎮' },
  { id: 'otros',      nombre: 'Otros',             icono: '📌' },
];

const TIPOS_CUENTA = {
  banco:    { nombre: 'Banco',    icono: '🏦' },
  efectivo: { nombre: 'Efectivo', icono: '💵' },
  tarjeta:  { nombre: 'Tarjeta',  icono: '💳' },
};

let usuarioActual = null;
let movimientos = [];
let cuentas = [];
let tipoActual = 'ingreso';
let categoriaActual = 'comida';
let cuentaActual = null;      // cuenta elegida en el formulario
let filtroActual = 'todos';
let mesActual = 'todos';
let filtroCuenta = 'todas';   // cuenta por la que se filtra la vista
let editandoId = null;        // movimiento que se está modificando
let editandoCuentaId = null;  // cuenta que se está modificando

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);

const formulario   = $('formulario');
const inpCantidad  = $('cantidad');
const inpNombre    = $('nombre');
const inpFecha     = $('fecha');
const inpMotivo    = $('motivo');
const bloqueGasto  = $('bloqueGasto');
const contFichas   = $('fichas');
const botonGuardar = $('botonGuardar');
const segIndicador = $('segIndicador');

/* ---------- Utilidades ---------- */
const dinero = (n) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

const buscarCategoria = (id) =>
  CATEGORIAS.find((c) => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1];

const fechaLegible = (iso) => {
  const [a, m, d] = iso.split('-');
  return d + '/' + m + '/' + a;
};

// Encabezado de grupo: "Hoy", "Ayer" o la fecha escrita.
function fechaTitulo(iso) {
  const hoy = new Date().toISOString().slice(0, 10);
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (iso === hoy) return 'Hoy';
  if (iso === ayer) return 'Ayer';

  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

/* Lectores tolerantes con los movimientos guardados antes de que
   existieran el nombre y la hora de registro. */
function nombreDe(m) {
  const n = m.nombre || m.concepto || '';
  if (n) return n;
  return m.tipo === 'gasto' ? buscarCategoria(m.categoria).nombre : 'Entrada';
}

/* Momento de captura, en milisegundos. Antes se deducia del id, pero
   con Firestore el id es texto; ahora manda "registrado" y el id solo
   se usa como respaldo cuando de verdad es un numero (datos viejos). */
function momentoDe(m) {
  if (m.registrado) {
    const t = Date.parse(m.registrado);
    if (!Number.isNaN(t)) return t;
  }
  const comoNumero = Number(m.id);
  if (Number.isFinite(comoNumero) && comoNumero > 0) return comoNumero;
  return Date.parse(m.fecha) || 0;
}

function horaLegible(m) {
  return new Date(momentoDe(m)).toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
  });
}

const sumar = (lista) => lista.reduce((s, m) => s + m.cantidad, 0);

/* ---------- Filtro por mes ----------
   Un solo sitio decide qué movimientos cuentan. Totales, gráfica,
   historial y exportaciones parten todos de aquí, para que nunca
   enseñen cosas distintas. */

const mesDe = (m) => (m.fecha || '').slice(0, 7);   // "2026-09"

function enMes(lista) {
  return mesActual === 'todos' ? lista : lista.filter((m) => mesDe(m) === mesActual);
}

/* Un traspaso toca dos cuentas: aparece tanto si se filtra por la de
   origen como por la de destino. */
function enCuenta(lista) {
  if (filtroCuenta === 'todas') return lista;
  return lista.filter((m) => m.tipo === 'transferencia'
    ? (m.cuentaOrigen === filtroCuenta || m.cuentaDestino === filtroCuenta)
    : m.cuenta === filtroCuenta);
}

const visibles = () => enCuenta(enMes(movimientos));

// Los traspasos quedan fuera de los totales a propósito: mover dinero
// de una cuenta a otra no es ganar ni gastar.
const soloIngresos = () => visibles().filter((m) => m.tipo === 'ingreso');
const soloGastos = () => visibles().filter((m) => m.tipo === 'gasto');

/* ---------- Cuentas ---------- */

const buscarCuenta = (id) => cuentas.find((c) => String(c.id) === String(id));

function nombreCuenta(id) {
  const c = buscarCuenta(id);
  return c ? c.nombre : 'Sin cuenta';
}

function iconoCuenta(id) {
  const c = buscarCuenta(id);
  return c ? (TIPOS_CUENTA[c.tipo] || TIPOS_CUENTA.banco).icono : '❔';
}

/* El saldo es acumulado: parte del saldo inicial y recorre TODOS los
   movimientos, no solo los del mes que se esté viendo. Un saldo que
   dependiera del filtro no sería el dinero que hay en la cuenta. */
function saldoDeCuenta(id) {
  const cuenta = buscarCuenta(id);
  let saldo = cuenta ? Number(cuenta.saldoInicial) || 0 : 0;

  movimientos.forEach((m) => {
    if (m.tipo === 'transferencia') {
      if (String(m.cuentaOrigen) === String(id)) saldo -= m.cantidad;
      if (String(m.cuentaDestino) === String(id)) saldo += m.cantidad;
    } else if (String(m.cuenta) === String(id)) {
      saldo += m.tipo === 'gasto' ? -m.cantidad : m.cantidad;
    }
  });

  return saldo;
}

// Lo que hay en total: la suma de todas las cuentas más lo que pueda
// quedar en movimientos que todavía no tienen cuenta asignada.
function saldoTotal() {
  const enCuentas = cuentas.reduce((s, c) => s + saldoDeCuenta(c.id), 0);
  const sueltos = sinCuenta().reduce(
    (s, m) => s + (m.tipo === 'gasto' ? -m.cantidad : m.cantidad), 0);
  return enCuentas + sueltos;
}

// Movimientos de antes de que existieran las cuentas.
const sinCuenta = () => movimientos.filter(
  (m) => m.tipo !== 'transferencia' && !buscarCuenta(m.cuenta));

// "2026-09" -> "septiembre de 2026"
function nombreMes(clave) {
  const [a, m] = clave.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('es-MX', {
    month: 'long', year: 'numeric',
  });
}

// Con mayúscula inicial: para el desplegable y los títulos sueltos.
const mesTitulo = (clave) => {
  const t = nombreMes(clave);
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/* ---------- Tema claro / oscuro ----------
   Mientras el usuario no elija, manda el ajuste del sistema; en
   cuanto toca el boton, su eleccion queda guardada y gana. */

const consultaOscuro = window.matchMedia('(prefers-color-scheme: dark)');

function temaActual() {
  return document.documentElement.dataset.tema ||
    (consultaOscuro.matches ? 'oscuro' : 'claro');
}

function etiquetarBotonTema() {
  $('btnTema').setAttribute(
    'aria-label',
    temaActual() === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'
  );
}

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  try {
    localStorage.setItem('tema', tema);
  } catch (e) { /* si el navegador bloquea el almacenamiento, el tema dura la sesion */ }
  etiquetarBotonTema();
}

function prepararTema() {
  etiquetarBotonTema();

  $('btnTema').addEventListener('click', () => {
    aplicarTema(temaActual() === 'oscuro' ? 'claro' : 'oscuro');
  });

  // Si el sistema cambia de tema y el usuario no ha elegido, la
  // pagina lo sigue: solo hay que corregir el texto del boton.
  consultaOscuro.addEventListener('change', () => {
    if (!document.documentElement.dataset.tema) etiquetarBotonTema();
  });
}

/* ---------- Pantalla de acceso ---------- */
let modoAcceso = 'entrar';

function avisar(texto, bien) {
  const aviso = $('accAviso');
  aviso.textContent = texto;
  aviso.classList.toggle('ok', !!bien);
  aviso.hidden = !texto;
}

function cambiarModoAcceso(modo) {
  modoAcceso = modo;
  const creando = modo === 'crear';

  document.querySelectorAll('[data-modo]').forEach((b) =>
    b.classList.toggle('activa', b.dataset.modo === modo)
  );
  $('accIndicador').classList.toggle('derecha', creando);

  $('grupoConfirma').hidden = !creando;
  $('accConfirma').required = creando;
  $('accClave').setAttribute('autocomplete', creando ? 'new-password' : 'current-password');
  $('btnAcceder').textContent = creando ? 'Crear cuenta' : 'Entrar';
  $('btnAcceder').classList.toggle('salida', creando);
  avisar('');
}

async function alEnviarAcceso(e) {
  e.preventDefault();

  const correo = $('accCorreo').value.trim();
  const clave = $('accClave').value;
  const boton = $('btnAcceder');

  if (modoAcceso === 'crear') {
    const problema = revisarCredenciales(correo, clave);
    if (problema) return avisar(problema);
    if (clave !== $('accConfirma').value) {
      return avisar('Las dos contraseñas no coinciden.');
    }
  } else if (!correo || !clave) {
    return avisar('Escribe tu correo y tu contraseña.');
  }

  // Entrar tarda (red o derivación de la clave): se bloquea el boton
  // para que no se envie dos veces.
  boton.disabled = true;
  const textoPrevio = boton.textContent;
  boton.textContent = modoAcceso === 'crear' ? 'Creando…' : 'Entrando…';

  try {
    const resultado = modoAcceso === 'crear'
      ? await almacen.crearCuenta(correo, clave)
      : await almacen.entrar(correo, clave);

    if (!resultado.ok) return avisar(resultado.mensaje);

    $('formAcceso').reset();
    rescatadosPendientes = resultado.rescatados || 0;
    // La pantalla la cambia observarSesion, no esta función: así el
    // mismo camino sirve al entrar, al crear cuenta y al recargar.
  } catch (error) {
    avisar('No se pudo completar la operación: ' + error.message);
  } finally {
    boton.disabled = false;
    boton.textContent = textoPrevio;
  }
}

async function alRecuperar() {
  const correo = $('accCorreo').value.trim();
  if (!correo) return avisar('Escribe tu correo arriba y vuelve a tocar el enlace.');

  const resultado = await almacen.recuperar(correo);
  avisar(resultado.mensaje, resultado.ok);
}

function mostrarAcceso() {
  movimientos = [];
  cuentas = [];
  cuentaActual = null;
  filtroCuenta = 'todas';
  mesActual = 'todos';

  $('pantallaAcceso').hidden = false;
  $('app').hidden = true;

  ['chipUsuario', 'btnExcel', 'btnCSV', 'btnSalir'].forEach((id) => { $(id).hidden = true; });

  cambiarModoAcceso('entrar');
  $('accCorreo').focus();
}

let rescatadosPendientes = 0;

async function abrirSesion(sesion) {
  usuarioActual = sesion;

  $('pantallaAcceso').hidden = true;
  $('app').hidden = false;

  // En pantallas chicas solo se enseña la parte de antes de la arroba;
  // el correo completo queda en el título, al pasar por encima.
  const chip = $('chipUsuario');
  const [local, dominio] = sesion.correo.split('@');
  chip.textContent = '';
  chip.title = sesion.correo;
  const parteLocal = document.createElement('span');
  parteLocal.textContent = '👤 ' + local;
  const parteDominio = document.createElement('span');
  parteDominio.className = 'chip-dominio';
  parteDominio.textContent = dominio ? '@' + dominio : '';
  chip.append(parteLocal, parteDominio);
  ['chipUsuario', 'btnExcel', 'btnCSV', 'btnSalir'].forEach((id) => { $(id).hidden = false; });

  prepararApp();

  try {
    [movimientos, cuentas] = await Promise.all([
      almacen.listar(),
      almacen.listarCuentas(),
    ]);
  } catch (error) {
    movimientos = [];
    cuentas = [];
    alert('No se pudieron leer tus datos: ' + error.message);
  }

  // Nadie guarda todo su dinero en el banco: si no hay ninguna cuenta,
  // se crea "Efectivo" para poder registrar desde el primer momento.
  if (!cuentas.length) {
    try {
      cuentas = [await almacen.agregarCuenta({
        nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: 0,
      })];
    } catch { /* si falla, la sección de cuentas lo pedirá a mano */ }
  }
  cuentaActual = cuentas.length ? cuentas[0].id : null;

  pintar();

  if (rescatadosPendientes) {
    alert('Se pasaron a tu cuenta ' + rescatadosPendientes +
      ' movimientos que ya estaban registrados en este navegador.');
    rescatadosPendientes = 0;
  }
}

async function cerrarSesion() {
  await almacen.salir();
}

/* ---------- Arranque ---------- */

// Lo de la app solo se arma una vez, aunque se entre y salga varias.
let appPreparada = false;

function prepararApp() {
  if (appPreparada) return;
  appPreparada = true;

  construirFichas();
  inpFecha.value = new Date().toISOString().slice(0, 10);

  document.querySelectorAll('#segmento .seg-opcion').forEach((b) => {
    b.addEventListener('click', () => cambiarTipo(b.dataset.tipo));
  });

  document.querySelectorAll('.filtro').forEach((b) => {
    b.addEventListener('click', () => {
      filtroActual = b.dataset.filtro;
      document.querySelectorAll('.filtro').forEach((o) =>
        o.classList.toggle('activo', o === b)
      );
      pintarHistorial();
    });
  });

  $('selectorMes').addEventListener('change', (e) => {
    mesActual = e.target.value;
    pintar();
  });

  $('selectorCuenta').addEventListener('change', (e) => {
    filtroCuenta = e.target.value;
    pintar();
  });

  $('btnCancelarEdicion').addEventListener('click', cancelarEdicion);

  $('btnNuevaCuenta').addEventListener('click', () => abrirFormCuenta(null));
  $('btnCancelarCuenta').addEventListener('click', cerrarFormCuenta);
  $('formCuenta').addEventListener('submit', alGuardarCuenta);
  $('btnAsignar').addEventListener('click', asignarSueltos);

  formulario.addEventListener('submit', alGuardar);
  $('btnTabla').addEventListener('click', alternarTabla);
  $('btnExcel').addEventListener('click', exportarExcel);
  $('btnCSV').addEventListener('click', exportarCSV);

  // El pintado lo dispara abrirSesion, ya con los datos del usuario cargados.
}

function construirFichas() {
  CATEGORIAS.forEach((c) => {
    const ficha = document.createElement('button');
    ficha.type = 'button';
    ficha.className = 'ficha' + (c.id === categoriaActual ? ' activa' : '');
    ficha.dataset.id = c.id;
    ficha.setAttribute('aria-pressed', String(c.id === categoriaActual));
    ficha.textContent = c.icono + ' ' + c.nombre;

    ficha.addEventListener('click', () => {
      categoriaActual = c.id;
      marcarFicha(c.id);
    });

    contFichas.appendChild(ficha);
  });
}

/* ---------- Fichas y desplegables de cuenta ----------
   Se reconstruyen cada vez que cambian las cuentas, cuidando de no
   perder la que el usuario ya tenía elegida. */
function pintarCuentasEnFormulario() {
  const caja = $('fichasCuenta');
  caja.innerHTML = '';

  // Si la cuenta elegida desapareció, se toma la primera que haya.
  if (!buscarCuenta(cuentaActual)) cuentaActual = cuentas.length ? cuentas[0].id : null;

  cuentas.forEach((c) => {
    const ficha = document.createElement('button');
    ficha.type = 'button';
    ficha.className = 'ficha' + (String(c.id) === String(cuentaActual) ? ' activa' : '');
    ficha.dataset.cuenta = c.id;
    ficha.setAttribute('aria-pressed', String(String(c.id) === String(cuentaActual)));
    ficha.textContent = (TIPOS_CUENTA[c.tipo] || TIPOS_CUENTA.banco).icono + ' ' + c.nombre;

    ficha.addEventListener('click', () => {
      cuentaActual = c.id;
      marcarFichaCuenta(c.id);
    });

    caja.appendChild(ficha);
  });

  $('pistaSinCuentas').hidden = cuentas.length > 0;

  // Los desplegables del traspaso y el de asignación masiva.
  ['traspasoOrigen', 'traspasoDestino', 'cuentaDestinoAsignar'].forEach((id) => {
    const sel = $(id);
    const elegido = sel.value;
    sel.innerHTML = '';
    cuentas.forEach((c) => {
      const op = document.createElement('option');
      op.value = c.id;
      op.textContent = (TIPOS_CUENTA[c.tipo] || TIPOS_CUENTA.banco).icono + '  ' + c.nombre;
      sel.appendChild(op);
    });
    if (elegido && buscarCuenta(elegido)) sel.value = elegido;
  });

  // Por comodidad, el destino arranca en una cuenta distinta al origen.
  if (cuentas.length > 1 && $('traspasoDestino').value === $('traspasoOrigen').value) {
    $('traspasoDestino').value = cuentas[1].id;
  }
}

function marcarFichaCuenta(id) {
  $('fichasCuenta').querySelectorAll('.ficha').forEach((f) => {
    const activa = String(f.dataset.cuenta) === String(id);
    f.classList.toggle('activa', activa);
    f.setAttribute('aria-pressed', String(activa));
  });
}

/* ---------- Alta y edición de cuentas ---------- */

function abrirFormCuenta(cuenta) {
  editandoCuentaId = cuenta ? cuenta.id : null;

  $('cuentaNombre').value = cuenta ? cuenta.nombre : '';
  $('cuentaTipo').value = cuenta ? cuenta.tipo : 'banco';
  $('cuentaSaldo').value = cuenta ? cuenta.saldoInicial : '';

  $('btnGuardarCuenta').textContent = cuenta ? 'Guardar cambios' : 'Guardar cuenta';
  $('formCuenta').hidden = false;
  $('cuentaNombre').focus();
}

function cerrarFormCuenta() {
  editandoCuentaId = null;
  $('formCuenta').reset();
  $('formCuenta').hidden = true;
}

async function alGuardarCuenta(e) {
  e.preventDefault();

  const nombre = $('cuentaNombre').value.trim();
  if (!nombre) return;

  const datos = {
    nombre: nombre,
    tipo: $('cuentaTipo').value,
    // Vacío significa empezar en cero.
    saldoInicial: parseFloat($('cuentaSaldo').value) || 0,
  };

  const idEditada = editandoCuentaId;
  const respaldo = cuentas;
  cerrarFormCuenta();

  try {
    if (idEditada) {
      const guardada = await almacen.actualizarCuenta(idEditada, datos);
      cuentas = cuentas.map((c) => (String(c.id) === String(idEditada) ? guardada : c));
    } else {
      cuentas = [...cuentas, await almacen.agregarCuenta(datos)];
      // La primera cuenta queda elegida en el formulario de captura.
      if (cuentas.length === 1) cuentaActual = cuentas[0].id;
    }
    pintar();
  } catch (error) {
    cuentas = respaldo;
    pintar();
    alert('No se pudo guardar la cuenta: ' + error.message);
  }
}

async function borrarCuenta(cuenta) {
  const usos = movimientos.filter((m) => m.tipo === 'transferencia'
    ? (String(m.cuentaOrigen) === String(cuenta.id) || String(m.cuentaDestino) === String(cuenta.id))
    : String(m.cuenta) === String(cuenta.id)).length;

  const aviso = usos
    ? 'La cuenta "' + cuenta.nombre + '" tiene ' + usos + ' movimientos.\n\n' +
      'Si la eliminas, esos movimientos se quedan sin cuenta (no se borran), ' +
      'y podrás reasignarlos después. ¿Continuar?'
    : '¿Eliminar la cuenta "' + cuenta.nombre + '"?';

  if (!confirm(aviso)) return;

  const respaldo = cuentas;
  cuentas = cuentas.filter((c) => String(c.id) !== String(cuenta.id));
  if (String(filtroCuenta) === String(cuenta.id)) filtroCuenta = 'todas';
  pintar();

  try {
    await almacen.borrarCuenta(cuenta.id);
  } catch (error) {
    cuentas = respaldo;
    pintar();
    alert('No se pudo eliminar la cuenta: ' + error.message);
  }
}

/* Asigna de golpe los movimientos que quedaron sin cuenta, para no
   tener que editarlos uno por uno. */
async function asignarSueltos() {
  const destino = $('cuentaDestinoAsignar').value;
  if (!destino) return;

  const pendientes = sinCuenta();
  if (!pendientes.length) return;

  if (!confirm('Se asignarán ' + pendientes.length + ' movimientos a "' +
    nombreCuenta(destino) + '". ¿Continuar?')) return;

  const boton = $('btnAsignar');
  boton.disabled = true;
  boton.textContent = 'Asignando…';

  let fallidos = 0;
  for (const m of pendientes) {
    try {
      const { id, ...datos } = m;
      const guardado = await almacen.actualizar(id, { ...datos, cuenta: destino });
      movimientos = movimientos.map((x) => (String(x.id) === String(id) ? guardado : x));
    } catch {
      fallidos++;
    }
  }

  boton.disabled = false;
  boton.textContent = 'Asignarlos';
  pintar();

  if (fallidos) alert('Quedaron ' + fallidos + ' movimientos sin asignar.');
}

/* ---------- Entrada / Salida / Traspaso ---------- */
function cambiarTipo(tipo) {
  tipoActual = tipo;
  const esGasto = tipo === 'gasto';
  const esTraspaso = tipo === 'transferencia';

  document.querySelectorAll('#segmento .seg-opcion').forEach((b) =>
    b.classList.toggle('activa', b.dataset.tipo === tipo)
  );
  segIndicador.classList.toggle('medio', esGasto);
  segIndicador.classList.toggle('ultimo', esTraspaso);

  bloqueGasto.classList.toggle('abierto', esGasto);
  inpMotivo.required = esGasto;

  // En un traspaso no hay "una" cuenta, sino origen y destino.
  $('bloqueTraspaso').classList.toggle('abierto', esTraspaso);
  $('grupoCuenta').hidden = esTraspaso;
  $('tituloCuenta').textContent = esGasto ? '¿De qué cuenta sale?' : '¿A qué cuenta entra?';

  $('tituloNombre').textContent = esTraspaso
    ? 'Concepto del traspaso'
    : (esGasto ? 'Nombre del gasto' : 'Concepto');
  inpNombre.placeholder = esTraspaso
    ? 'Ej. Retiro del cajero'
    : (esGasto ? 'Ej. Recibo de luz' : 'Ej. Venta del día');

  // Durante una edición el botón conserva su texto aunque se cambie
  // de entrada a salida: lo que se hace sigue siendo guardar cambios.
  botonGuardar.textContent = editandoId
    ? 'Guardar cambios'
    : (esTraspaso ? 'Registrar traspaso'
      : (esGasto ? 'Registrar salida' : 'Registrar entrada'));
  botonGuardar.classList.toggle('salida', esGasto);
  botonGuardar.classList.toggle('neutro', esTraspaso);
}

/* ---------- Alta y modificación ---------- */
async function alGuardar(e) {
  e.preventDefault();

  const cantidad = parseFloat(inpCantidad.value);
  if (!cantidad || cantidad <= 0) return;

  const original = editandoId
    ? movimientos.find((m) => String(m.id) === String(editandoId))
    : null;

  const mov = {
    tipo: tipoActual,
    cantidad: cantidad,
    fecha: inpFecha.value,
    // Al modificar se conserva la hora de captura original: es cuándo
    // ocurrió el movimiento, no cuándo se corrigió el dato.
    registrado: (original && original.registrado) || new Date().toISOString(),
    nombre: inpNombre.value.trim(),
  };

  if (tipoActual === 'transferencia') {
    const origen = $('traspasoOrigen').value;
    const destino = $('traspasoDestino').value;

    if (!origen || !destino) {
      return alert('Elige de qué cuenta sale el dinero y a cuál entra.');
    }
    if (origen === destino) {
      return alert('Un traspaso tiene que ir de una cuenta a otra distinta.');
    }

    mov.cuentaOrigen = origen;
    mov.cuentaDestino = destino;
    if (!mov.nombre) {
      mov.nombre = 'De ' + nombreCuenta(origen) + ' a ' + nombreCuenta(destino);
    }
  } else {
    if (!cuentaActual) {
      return alert('Elige en qué cuenta entra o de cuál sale el dinero.');
    }
    mov.cuenta = cuentaActual;

    if (tipoActual === 'gasto') {
      const motivo = inpMotivo.value.trim();
      if (!motivo) {
        inpMotivo.focus();
        return;
      }
      mov.categoria = categoriaActual;
      mov.motivo = motivo;
      if (!mov.nombre) mov.nombre = buscarCategoria(mov.categoria).nombre;
    } else if (!mov.nombre) {
      mov.nombre = 'Entrada';
    }
  }

  const idEditado = editandoId;
  const respaldo = movimientos;

  limpiarFormulario();
  if (idEditado) terminarEdicion();

  try {
    if (idEditado) {
      const guardado = await almacen.actualizar(idEditado, mov);
      movimientos = movimientos.map((m) =>
        String(m.id) === String(idEditado) ? guardado : m);
    } else {
      movimientos = [await almacen.agregar(mov), ...movimientos];
    }
    pintar();
  } catch (error) {
    movimientos = respaldo;
    pintar();
    alert('No se pudo guardar el movimiento: ' + error.message);
  }
}

// Deja el formulario listo para capturar, conservando la fecha elegida.
function limpiarFormulario() {
  const fecha = inpFecha.value;
  formulario.reset();
  inpFecha.value = fecha;
  inpCantidad.focus();
}

/* ---------- Edición ---------- */
function editar(id) {
  const mov = movimientos.find((m) => String(m.id) === String(id));
  if (!mov) return;

  editandoId = id;
  cambiarTipo(mov.tipo);

  inpCantidad.value = mov.cantidad;
  inpNombre.value = nombreDe(mov);
  inpFecha.value = mov.fecha;

  if (mov.tipo === 'transferencia') {
    $('traspasoOrigen').value = mov.cuentaOrigen;
    $('traspasoDestino').value = mov.cuentaDestino;
  } else {
    if (buscarCuenta(mov.cuenta)) {
      cuentaActual = mov.cuenta;
      marcarFichaCuenta(cuentaActual);
    }
    if (mov.tipo === 'gasto') {
      categoriaActual = mov.categoria || 'otros';
      marcarFicha(categoriaActual);
      inpMotivo.value = mov.motivo || '';
    }
  }

  $('nombreEditado').textContent = nombreDe(mov);
  $('avisoEdicion').hidden = false;
  botonGuardar.textContent = 'Guardar cambios';

  // Se redibuja para que la fila en edición quede señalada.
  pintarHistorial();

  // En el móvil el formulario queda arriba, fuera de vista.
  $('avisoEdicion').scrollIntoView({ behavior: 'smooth', block: 'center' });
  inpCantidad.focus();
  inpCantidad.select();
}

function terminarEdicion() {
  editandoId = null;
  $('avisoEdicion').hidden = true;
  cambiarTipo('ingreso');
  marcarFicha('comida');
  categoriaActual = 'comida';
  pintarHistorial();   // quita la marca de la fila
}

function cancelarEdicion() {
  terminarEdicion();
  limpiarFormulario();
}

function marcarFicha(id) {
  contFichas.querySelectorAll('.ficha').forEach((f) => {
    const activa = f.dataset.id === id;
    f.classList.toggle('activa', activa);
    f.setAttribute('aria-pressed', String(activa));
  });
}

async function eliminar(id) {
  const respaldo = movimientos;

  // Desaparece de la pantalla al instante; si el borrado falla, vuelve.
  movimientos = movimientos.filter((m) => String(m.id) !== String(id));
  pintar();

  try {
    await almacen.borrar(id);
  } catch (error) {
    movimientos = respaldo;
    pintar();
    alert('No se pudo eliminar el movimiento: ' + error.message);
  }
}

/* ---------- Pintado ---------- */
function pintar() {
  pintarCuentasEnFormulario();
  pintarSelectorMes();
  pintarSelectorCuenta();
  pintarCuentas();
  pintarTotales();
  pintarHistorial();
  pintarGrafica();
}

function pintarSelectorCuenta() {
  const selector = $('selectorCuenta');

  if (!buscarCuenta(filtroCuenta)) filtroCuenta = 'todas';

  selector.innerHTML = '';
  const todas = document.createElement('option');
  todas.value = 'todas';
  todas.textContent = 'Todas las cuentas';
  selector.appendChild(todas);

  cuentas.forEach((c) => {
    const op = document.createElement('option');
    op.value = c.id;
    op.textContent = (TIPOS_CUENTA[c.tipo] || TIPOS_CUENTA.banco).icono + '  ' + c.nombre;
    selector.appendChild(op);
  });

  selector.value = filtroCuenta;
  selector.hidden = cuentas.length < 2;   // con una sola no hay nada que elegir
}

/* Saldo de cada cuenta, en barras. La escala es contra el saldo mayor,
   y cada barra lleva su cifra escrita al lado. */
function pintarCuentas() {
  const cont = $('graficaCuentas');
  cont.innerHTML = '';

  $('sinCuentas').hidden = cuentas.length > 0;

  const pendientes = sinCuenta();
  $('avisoSinAsignar').hidden = !(pendientes.length && cuentas.length);
  if (pendientes.length && cuentas.length) {
    const uno = pendientes.length === 1;
    $('textoSinAsignar').textContent = 'Hay ' + pendientes.length +
      (uno ? ' movimiento registrado' : ' movimientos registrados') +
      ' antes de que existieran las cuentas. ¿A cuál ' +
      (uno ? 'pertenece?' : 'pertenecen?');
  }

  if (!cuentas.length) return;

  const saldos = cuentas.map((c) => ({ cuenta: c, saldo: saldoDeCuenta(c.id) }));
  const mayor = Math.max(...saldos.map((s) => Math.abs(s.saldo)), 1);

  saldos.forEach(({ cuenta, saldo }) => {
    const fila = document.createElement('div');
    fila.className = 'cuenta-fila';

    const encabezado = document.createElement('div');
    encabezado.className = 'cuenta-encabezado';

    const nombre = document.createElement('span');
    nombre.className = 'cuenta-nombre';
    const texto = document.createElement('span');
    texto.textContent = (TIPOS_CUENTA[cuenta.tipo] || TIPOS_CUENTA.banco).icono +
      ' ' + cuenta.nombre;
    nombre.appendChild(texto);

    const derecha = document.createElement('div');
    derecha.className = 'cuenta-derecha';

    const monto = document.createElement('span');
    monto.className = 'cuenta-saldo' + (saldo < 0 ? ' negativo' : '');
    monto.textContent = dinero(saldo);

    const editar = document.createElement('button');
    editar.className = 'mov-accion';
    editar.type = 'button';
    editar.textContent = '✏️';
    editar.title = 'Editar cuenta';
    editar.setAttribute('aria-label', 'Editar ' + cuenta.nombre);
    editar.addEventListener('click', () => abrirFormCuenta(cuenta));

    const quitar = document.createElement('button');
    quitar.className = 'mov-accion';
    quitar.type = 'button';
    quitar.textContent = '🗑️';
    quitar.title = 'Eliminar cuenta';
    quitar.setAttribute('aria-label', 'Eliminar ' + cuenta.nombre);
    quitar.addEventListener('click', () => borrarCuenta(cuenta));

    derecha.append(monto, editar, quitar);
    encabezado.append(nombre, derecha);

    const riel = document.createElement('div');
    riel.className = 'barra-riel';

    const relleno = document.createElement('div');
    relleno.className = 'barra-relleno';
    relleno.style.width = (Math.abs(saldo) / mayor) * 100 + '%';
    // En rojo solo si la cuenta está en números rojos.
    relleno.style.background = saldo < 0 ? 'var(--sale-dato)' : 'var(--entra-dato)';

    riel.appendChild(relleno);
    fila.append(encabezado, riel);
    cont.appendChild(fila);
  });
}

/* El desplegable solo ofrece meses que tienen movimientos: no tiene
   sentido poder elegir un mes vacío. */
function pintarSelectorMes() {
  const selector = $('selectorMes');
  const meses = [...new Set(movimientos.map(mesDe).filter(Boolean))].sort().reverse();

  // Si el mes elegido se quedó sin movimientos, se vuelve a "todos".
  if (mesActual !== 'todos' && !meses.includes(mesActual)) mesActual = 'todos';

  selector.innerHTML = '';
  const todos = document.createElement('option');
  todos.value = 'todos';
  todos.textContent = 'Todos los meses';
  selector.appendChild(todos);

  meses.forEach((clave) => {
    const op = document.createElement('option');
    op.value = clave;
    op.textContent = mesTitulo(clave);
    selector.appendChild(op);
  });

  selector.value = mesActual;
  selector.hidden = meses.length < 2;   // con un solo mes no aporta nada
}

function pintarTotales() {
  const ingresos = sumar(soloIngresos());
  const gastos = sumar(soloGastos());
  const saldo = ingresos - gastos;

  const porMes = mesActual !== 'todos';
  const porCuenta = filtroCuenta !== 'todas';

  /* Sin filtro de mes, la cifra grande es dinero que existe: saldos
     iniciales incluidos. Con un mes elegido pasa a ser el movimiento
     neto de ese mes, que es otra cosa, y por eso cambia la etiqueta. */
  let cifra;
  let etiqueta;

  if (porMes) {
    cifra = saldo;
    etiqueta = porCuenta
      ? 'Balance de ' + nombreMes(mesActual) + ' en ' + nombreCuenta(filtroCuenta)
      : 'Balance de ' + nombreMes(mesActual);
  } else if (porCuenta) {
    cifra = saldoDeCuenta(filtroCuenta);
    etiqueta = 'Saldo en ' + nombreCuenta(filtroCuenta);
  } else {
    cifra = saldoTotal();
    etiqueta = 'Saldo disponible';
  }

  const nodo = $('saldoTotal');
  nodo.textContent = dinero(cifra);
  nodo.classList.toggle('negativo', cifra < 0);
  $('etiquetaCifra').textContent = etiqueta;

  // Mientras haya un filtro puesto, el total de todo se enseña aparte.
  $('parSaldoTotal').hidden = !(porMes || porCuenta);
  $('saldoGeneral').textContent = dinero(saldoTotal());

  $('totalIngresos').textContent = dinero(ingresos);
  $('totalGastos').textContent = dinero(gastos);
}

function pintarHistorial() {
  const cont = $('historial');
  cont.innerHTML = '';

  const enPantalla = visibles()
    .filter((m) => filtroActual === 'todos' || m.tipo === filtroActual)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || momentoDe(b) - momentoDe(a));

  $('sinMovimientos').hidden = enPantalla.length > 0;
  $('sinMovimientos').textContent = mesActual === 'todos'
    ? 'Aún no registras movimientos.'
    : 'No hay movimientos en ' + nombreMes(mesActual) + '.';

  // Agrupar por dia para que el historial se lea como una bitacora.
  const porDia = new Map();
  enPantalla.forEach((m) => {
    if (!porDia.has(m.fecha)) porDia.set(m.fecha, []);
    porDia.get(m.fecha).push(m);
  });

  porDia.forEach((delDia, fecha) => {
    const grupo = document.createElement('section');

    const cabeza = document.createElement('div');
    cabeza.className = 'dia-cabeza';

    const titulo = document.createElement('span');
    titulo.className = 'dia-fecha';
    titulo.textContent = fechaTitulo(fecha);

    const neto = delDia.reduce(
      (s, m) => s + (m.tipo === 'gasto' ? -m.cantidad : m.cantidad), 0
    );
    const netoTxt = document.createElement('span');
    netoTxt.className = 'dia-neto';
    netoTxt.textContent = (neto >= 0 ? '+' : '−') + dinero(Math.abs(neto));

    cabeza.append(titulo, netoTxt);
    grupo.appendChild(cabeza);

    delDia.forEach((m) => grupo.appendChild(filaMovimiento(m)));
    cont.appendChild(grupo);
  });
}

function filaMovimiento(m) {
  const esGasto = m.tipo === 'gasto';
  const esTraspaso = m.tipo === 'transferencia';
  const cat = esGasto ? buscarCategoria(m.categoria) : null;

  const fila = document.createElement('article');
  fila.className = 'movimiento ' + m.tipo;

  const marca = document.createElement('div');
  marca.className = 'mov-marca';
  marca.textContent = esTraspaso ? '🔄' : (esGasto ? cat.icono : '💵');

  const cuerpo = document.createElement('div');
  cuerpo.className = 'mov-cuerpo';

  const nombre = document.createElement('div');
  nombre.className = 'mov-nombre';
  nombre.textContent = nombreDe(m);

  // Segunda línea: de dónde viene o a dónde va el dinero, y la hora.
  const seccion = document.createElement('div');
  seccion.className = 'mov-seccion';
  if (esTraspaso) {
    seccion.textContent = nombreCuenta(m.cuentaOrigen) + ' → ' +
      nombreCuenta(m.cuentaDestino) + '  ·  ' + horaLegible(m);
  } else {
    const donde = iconoCuenta(m.cuenta) + ' ' + nombreCuenta(m.cuenta);
    seccion.textContent = (esGasto ? cat.nombre : 'Entrada') +
      '  ·  ' + donde + '  ·  ' + horaLegible(m);
  }

  cuerpo.append(nombre, seccion);

  const monto = document.createElement('div');
  monto.className = 'mov-monto';
  // Un traspaso no suma ni resta: no lleva signo.
  monto.textContent = (esTraspaso ? '' : (esGasto ? '−' : '+')) + dinero(m.cantidad);

  const acciones = document.createElement('div');
  acciones.className = 'mov-acciones';

  const modificar = document.createElement('button');
  modificar.className = 'mov-accion';
  modificar.type = 'button';
  modificar.textContent = '✏️';
  modificar.title = 'Editar movimiento';
  modificar.setAttribute('aria-label', 'Editar ' + nombreDe(m));
  modificar.addEventListener('click', () => editar(m.id));

  const quitar = document.createElement('button');
  quitar.className = 'mov-accion mov-quitar';
  quitar.type = 'button';
  quitar.textContent = '🗑️';
  quitar.title = 'Eliminar movimiento';
  quitar.setAttribute('aria-label', 'Eliminar ' + nombreDe(m));
  quitar.addEventListener('click', () => {
    if (confirm('¿Eliminar "' + nombreDe(m) + '" por ' + dinero(m.cantidad) + '?')) {
      eliminar(m.id);
    }
  });

  acciones.append(modificar, quitar);
  fila.append(marca, cuerpo, monto, acciones);

  if (String(m.id) === String(editandoId)) fila.classList.add('en-edicion');

  // El motivo va en su propio renglon a lo ancho, para que no quede
  // exprimido en una columna angosta cuando la pantalla es chica.
  if (esGasto && m.motivo) {
    const motivo = document.createElement('div');
    motivo.className = 'mov-motivo';
    motivo.textContent = m.motivo;
    fila.appendChild(motivo);
  }

  return fila;
}

/* ---------- Grafica de salidas por seccion ----------
   Barras ordenadas de mayor a menor, un solo tono: la comparacion
   aqui es de magnitud, no de identidad, y cada barra lleva su valor
   escrito, asi que nada depende unicamente del color. */
function totalesPorSeccion() {
  const acumulado = {};
  soloGastos().forEach((m) => {
    const id = m.categoria || 'otros';
    if (!acumulado[id]) acumulado[id] = { total: 0, cuenta: 0 };
    acumulado[id].total += m.cantidad;
    acumulado[id].cuenta++;
  });

  return Object.entries(acumulado)
    .map(([id, d]) => ({ cat: buscarCategoria(id), ...d }))
    .sort((a, b) => b.total - a.total);
}

function pintarGrafica() {
  const cont = $('grafica');
  const cuerpo = $('tablaCuerpo');
  cont.innerHTML = '';
  cuerpo.innerHTML = '';

  const secciones = totalesPorSeccion();
  aplicarVista();
  if (!secciones.length) return;

  const total = secciones.reduce((s, x) => s + x.total, 0);
  const mayor = secciones[0].total;

  secciones.forEach((s) => {
    const pct = (s.total / total) * 100;

    const fila = document.createElement('div');
    fila.className = 'barra-fila';

    const etiquetas = document.createElement('div');
    etiquetas.className = 'barra-etiquetas';

    const nombre = document.createElement('span');
    nombre.className = 'barra-nombre';
    nombre.textContent = s.cat.icono + ' ' + s.cat.nombre;

    const valor = document.createElement('span');
    valor.className = 'barra-valor';
    valor.append(dinero(s.total) + '  ');
    const pctTxt = document.createElement('span');
    pctTxt.textContent = pct.toFixed(1) + '%';
    valor.appendChild(pctTxt);

    etiquetas.append(nombre, valor);

    const riel = document.createElement('div');
    riel.className = 'barra-riel';

    const relleno = document.createElement('div');
    relleno.className = 'barra-relleno';
    // Escala contra el mayor, no contra el total: las diferencias se ven.
    relleno.style.width = (s.total / mayor) * 100 + '%';

    riel.appendChild(relleno);
    fila.append(etiquetas, riel);
    cont.appendChild(fila);

    // Misma informacion en la vista de tabla.
    const tr = document.createElement('tr');
    [
      s.cat.nombre,
      dinero(s.total),
      pct.toFixed(1) + '%',
      String(s.cuenta),
    ].forEach((txt) => {
      const td = document.createElement('td');
      td.textContent = txt;
      tr.appendChild(td);
    });
    cuerpo.appendChild(tr);
  });

  const trTotal = document.createElement('tr');
  [
    'Total',
    dinero(total),
    '100%',
    String(soloGastos().length),
  ].forEach((txt) => {
    const td = document.createElement('td');
    td.textContent = txt;
    trTotal.appendChild(td);
  });
  cuerpo.appendChild(trTotal);
}

/* Unico lugar que decide que se ve: grafica, tabla o el aviso de vacio.
   Lo llaman tanto el boton como cada repintado. */
function aplicarVista() {
  const boton = $('btnTabla');
  const verTabla = boton.getAttribute('aria-pressed') === 'true';
  const hayDatos = totalesPorSeccion().length > 0;

  $('grafica').hidden = !hayDatos || verTabla;
  $('tabla').hidden = !hayDatos || !verTabla;
  $('sinGastos').hidden = hayDatos;
  boton.hidden = !hayDatos;
  boton.textContent = verTabla ? 'Ver gráfica' : 'Ver tabla';
}

function alternarTabla() {
  const boton = $('btnTabla');
  boton.setAttribute('aria-pressed', String(boton.getAttribute('aria-pressed') !== 'true'));
  aplicarVista();
}

/* ---------- Exportar ---------- */
const FMT_MONEDA = '"$"#,##0.00_);[Red]("$"#,##0.00)';
const FMT_PCT = '0.0%';

// El nombre del archivo dice qué contiene: todo, o un mes concreto.
const nombreArchivo = (ext) =>
  'control_dinero_' +
  (mesActual === 'todos' ? new Date().toISOString().slice(0, 10) : mesActual) +
  '.' + ext;

const periodoTexto = () =>
  mesActual === 'todos' ? 'Todos los meses' : mesTitulo(mesActual);

function formatearColumna(hoja, letra, formato) {
  const rango = XLSX.utils.decode_range(hoja['!ref']);
  for (let f = 1; f <= rango.e.r; f++) {
    const celda = hoja[letra + (f + 1)];
    if (celda && celda.t === 'n') celda.z = formato;
  }
}

function exportarExcel() {
  if (!visibles().length) {
    alert('No hay movimientos para exportar.');
    return;
  }

  if (typeof XLSX === 'undefined') {
    alert(
      'No se pudo cargar el generador de Excel (parece que no hay conexion a internet).\n\n' +
      'Se descargara un archivo CSV que Excel abre sin problema.'
    );
    exportarCSV();
    return;
  }

  const ingresos = sumar(soloIngresos());
  const gastos = sumar(soloGastos());
  const libro = XLSX.utils.book_new();

  /* Hoja 1: Resumen */
  const resumen = XLSX.utils.aoa_to_sheet([
    ['Resumen de ingresos y gastos'],
    ['Periodo', periodoTexto()],
    ['Generado el', fechaLegible(new Date().toISOString().slice(0, 10))],
    [],
    ['Concepto', 'Monto'],
    ['Total de entradas', ingresos],
    ['Total de salidas', gastos],
    ['Saldo disponible', ingresos - gastos],
    [],
    ['Movimientos registrados', visibles().length],
  ]);
  resumen['!cols'] = [{ wch: 26 }, { wch: 16 }];
  ['B6', 'B7', 'B8'].forEach((r) => { if (resumen[r]) resumen[r].z = FMT_MONEDA; });
  XLSX.utils.book_append_sheet(libro, resumen, 'Resumen');

  /* Hoja 2: Movimientos con detalle */
  const filas = [[
    '#', 'Fecha', 'Hora de registro', 'Tipo', 'Cuenta', 'Seccion / Categoria',
    'Nombre', 'Motivo de la salida', 'Entrada', 'Salida', 'Saldo acumulado',
  ]];

  let saldo = 0;
  visibles()
    .slice()
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || momentoDe(a) - momentoDe(b))
    .forEach((m, i) => {
      const esGasto = m.tipo === 'gasto';
      const esTraspaso = m.tipo === 'transferencia';

      // El traspaso no altera el saldo: el dinero solo cambia de sitio.
      if (!esTraspaso) saldo += esGasto ? -m.cantidad : m.cantidad;

      filas.push([
        i + 1,
        m.fecha,
        horaLegible(m),
        esTraspaso ? 'Traspaso' : (esGasto ? 'Salida' : 'Entrada'),
        esTraspaso
          ? nombreCuenta(m.cuentaOrigen) + ' -> ' + nombreCuenta(m.cuentaDestino)
          : nombreCuenta(m.cuenta),
        esGasto ? buscarCategoria(m.categoria).nombre : '',
        nombreDe(m),
        esGasto ? m.motivo || '' : '',
        esGasto || esTraspaso ? null : m.cantidad,
        esGasto ? m.cantidad : null,
        saldo,
      ]);
    });

  filas.push([]);
  filas.push(['', '', '', '', '', '', '', 'TOTALES', ingresos, gastos, ingresos - gastos]);

  const hojaMov = XLSX.utils.aoa_to_sheet(filas);
  hojaMov['!cols'] = [
    { wch: 5 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 26 }, { wch: 22 },
    { wch: 30 }, { wch: 48 }, { wch: 14 }, { wch: 14 }, { wch: 17 },
  ];
  ['I', 'J', 'K'].forEach((c) => formatearColumna(hojaMov, c, FMT_MONEDA));
  hojaMov['!autofilter'] = { ref: 'A1:K' + (filas.length - 2) };
  XLSX.utils.book_append_sheet(libro, hojaMov, 'Movimientos');

  /* Hoja 3: saldo de cada cuenta */
  if (cuentas.length) {
    const filasCuentas = [['Cuenta', 'Tipo', 'Saldo inicial', 'Saldo actual']];
    cuentas.forEach((c) => {
      filasCuentas.push([
        c.nombre,
        (TIPOS_CUENTA[c.tipo] || TIPOS_CUENTA.banco).nombre,
        Number(c.saldoInicial) || 0,
        saldoDeCuenta(c.id),
      ]);
    });
    filasCuentas.push(['TOTAL', '', '', saldoTotal()]);

    const hojaCuentas = XLSX.utils.aoa_to_sheet(filasCuentas);
    hojaCuentas['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 15 }, { wch: 15 }];
    ['C', 'D'].forEach((c) => formatearColumna(hojaCuentas, c, FMT_MONEDA));
    XLSX.utils.book_append_sheet(libro, hojaCuentas, 'Cuentas');
  }

  /* Hoja 3: Salidas por seccion */
  const filasCat = [['Seccion', 'Total gastado', '% del gasto', 'Movimientos']];
  totalesPorSeccion().forEach((s) => {
    filasCat.push([s.cat.nombre, s.total, gastos ? s.total / gastos : 0, s.cuenta]);
  });
  filasCat.push(['TOTAL', gastos, gastos ? 1 : 0, soloGastos().length]);

  const hojaCat = XLSX.utils.aoa_to_sheet(filasCat);
  hojaCat['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 13 }, { wch: 13 }];
  formatearColumna(hojaCat, 'B', FMT_MONEDA);
  formatearColumna(hojaCat, 'C', FMT_PCT);
  XLSX.utils.book_append_sheet(libro, hojaCat, 'Salidas por seccion');

  XLSX.writeFile(libro, nombreArchivo('xlsx'));
}

function exportarCSV() {
  if (!visibles().length) {
    alert('No hay movimientos para exportar.');
    return;
  }

  const filas = [[
    'Fecha', 'Hora de registro', 'Tipo', 'Cuenta', 'Seccion / Categoria',
    'Nombre', 'Motivo de la salida', 'Cantidad',
  ]];

  visibles()
    .slice()
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || momentoDe(a) - momentoDe(b))
    .forEach((m) => {
      const esGasto = m.tipo === 'gasto';
      const esTraspaso = m.tipo === 'transferencia';
      filas.push([
        m.fecha,
        horaLegible(m),
        esTraspaso ? 'Traspaso' : (esGasto ? 'Salida' : 'Entrada'),
        esTraspaso
          ? nombreCuenta(m.cuentaOrigen) + ' -> ' + nombreCuenta(m.cuentaDestino)
          : nombreCuenta(m.cuenta),
        esGasto ? buscarCategoria(m.categoria).nombre : '',
        nombreDe(m),
        esGasto ? m.motivo || '' : '',
        m.cantidad.toFixed(2),
      ]);
    });

  const csv = filas
    .map((f) => f.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(','))
    .join('\n');

  const url = URL.createObjectURL(
    new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo('csv');
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Punto de entrada ---------- */
async function arrancar() {
  prepararTema();

  document.querySelectorAll('[data-modo]').forEach((b) => {
    b.addEventListener('click', () => cambiarModoAcceso(b.dataset.modo));
  });
  $('formAcceso').addEventListener('submit', alEnviarAcceso);
  $('btnRecuperar').addEventListener('click', alRecuperar);
  $('btnSalir').addEventListener('click', cerrarSesion);

  // Preparar el almacén puede tardar (descargar Firebase). Se enseña
  // ya la pantalla de acceso, en espera, para no dejar la página en
  // blanco mientras tanto.
  $('pantallaAcceso').hidden = false;
  $('btnAcceder').disabled = true;
  $('btnAcceder').textContent = 'Cargando…';

  const { almacen: elegido, aviso, esPrueba } = await crearAlmacen();
  almacen = elegido;

  $('btnAcceder').disabled = false;
  $('btnAcceder').textContent = 'Entrar';

  // Deja ver de dónde salen los datos, para no confundir "modo local"
  // con "ya está en la nube".
  const insignia = $('insigniaModo');
  if (almacen.modo === 'firebase') {
    insignia.textContent = 'Conectado a Firebase';
  } else if (esPrueba) {
    insignia.textContent = 'Modo de prueba · no se guarda en la nube';
  } else {
    insignia.textContent = 'Modo local (este navegador)';
  }
  insignia.classList.toggle('local', almacen.modo === 'local' && !esPrueba);
  insignia.classList.toggle('prueba', esPrueba);

  if (aviso) {
    avisar(aviso);
    $('pantallaAcceso').hidden = false;
  }

  // Un solo camino decide qué pantalla se ve: entrar, crear cuenta,
  // salir y recargar terminan todos aquí.
  almacen.observarSesion((sesion) => {
    if (sesion) abrirSesion(sesion);
    else mostrarAcceso();
  });
}

arrancar();
