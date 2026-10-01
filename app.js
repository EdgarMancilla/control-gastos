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

let usuarioActual = null;
let movimientos = [];
let tipoActual = 'ingreso';
let categoriaActual = 'comida';
let filtroActual = 'todos';

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
const soloIngresos = () => movimientos.filter((m) => m.tipo === 'ingreso');
const soloGastos = () => movimientos.filter((m) => m.tipo === 'gasto');

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

  $('chipUsuario').textContent = '👤 ' + sesion.correo;
  ['chipUsuario', 'btnExcel', 'btnCSV', 'btnSalir'].forEach((id) => { $(id).hidden = false; });

  prepararApp();

  try {
    movimientos = await almacen.listar();
  } catch (error) {
    movimientos = [];
    alert('No se pudieron leer tus movimientos: ' + error.message);
  }
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
      contFichas.querySelectorAll('.ficha').forEach((f) => {
        const activa = f === ficha;
        f.classList.toggle('activa', activa);
        f.setAttribute('aria-pressed', String(activa));
      });
    });

    contFichas.appendChild(ficha);
  });
}

/* ---------- Entrada / Salida ---------- */
function cambiarTipo(tipo) {
  tipoActual = tipo;
  const esGasto = tipo === 'gasto';

  document.querySelectorAll('#segmento .seg-opcion').forEach((b) =>
    b.classList.toggle('activa', b.dataset.tipo === tipo)
  );
  segIndicador.classList.toggle('derecha', esGasto);

  bloqueGasto.classList.toggle('abierto', esGasto);
  inpMotivo.required = esGasto;

  $('tituloNombre').textContent = esGasto ? 'Nombre del gasto' : 'Concepto';
  inpNombre.placeholder = esGasto ? 'Ej. Recibo de luz' : 'Ej. Venta del día';

  botonGuardar.textContent = esGasto ? 'Registrar salida' : 'Registrar entrada';
  botonGuardar.classList.toggle('salida', esGasto);
}

/* ---------- Alta ---------- */
async function alGuardar(e) {
  e.preventDefault();

  const cantidad = parseFloat(inpCantidad.value);
  if (!cantidad || cantidad <= 0) return;

  const mov = {
    tipo: tipoActual,
    cantidad: cantidad,
    fecha: inpFecha.value,
    registrado: new Date().toISOString(),
    nombre: inpNombre.value.trim(),
  };

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

  // Se limpia el formulario de inmediato: la escritura puede tardar
  // si hay red de por medio, y no conviene dejarlo bloqueado.
  const fecha = inpFecha.value;
  formulario.reset();
  inpFecha.value = fecha;
  inpCantidad.focus();

  try {
    const guardado = await almacen.agregar(mov);
    movimientos.unshift(guardado);
    pintar();
  } catch (error) {
    alert('No se pudo guardar el movimiento: ' + error.message);
  }
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
  pintarTotales();
  pintarHistorial();
  pintarGrafica();
}

function pintarTotales() {
  const ingresos = sumar(soloIngresos());
  const gastos = sumar(soloGastos());
  const saldo = ingresos - gastos;

  const cifra = $('saldoTotal');
  cifra.textContent = dinero(saldo);
  cifra.classList.toggle('negativo', saldo < 0);

  $('totalIngresos').textContent = dinero(ingresos);
  $('totalGastos').textContent = dinero(gastos);
}

function pintarHistorial() {
  const cont = $('historial');
  cont.innerHTML = '';

  const visibles = movimientos
    .filter((m) => filtroActual === 'todos' || m.tipo === filtroActual)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || momentoDe(b) - momentoDe(a));

  $('sinMovimientos').hidden = visibles.length > 0;

  // Agrupar por dia para que el historial se lea como una bitacora.
  const porDia = new Map();
  visibles.forEach((m) => {
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
  const cat = esGasto ? buscarCategoria(m.categoria) : null;

  const fila = document.createElement('article');
  fila.className = 'movimiento ' + m.tipo;

  const marca = document.createElement('div');
  marca.className = 'mov-marca';
  marca.textContent = esGasto ? cat.icono : '💵';

  const cuerpo = document.createElement('div');
  cuerpo.className = 'mov-cuerpo';

  const nombre = document.createElement('div');
  nombre.className = 'mov-nombre';
  nombre.textContent = nombreDe(m);

  const seccion = document.createElement('div');
  seccion.className = 'mov-seccion';
  seccion.textContent = esGasto
    ? cat.nombre + '  ·  ' + horaLegible(m)
    : 'Entrada  ·  ' + horaLegible(m);

  cuerpo.append(nombre, seccion);

  const monto = document.createElement('div');
  monto.className = 'mov-monto';
  monto.textContent = (esGasto ? '−' : '+') + dinero(m.cantidad);

  const quitar = document.createElement('button');
  quitar.className = 'mov-quitar';
  quitar.type = 'button';
  quitar.textContent = '×';
  quitar.title = 'Eliminar movimiento';
  quitar.setAttribute('aria-label', 'Eliminar ' + nombreDe(m));
  quitar.addEventListener('click', () => eliminar(m.id));

  fila.append(marca, cuerpo, monto, quitar);

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

const nombreArchivo = (ext) =>
  'control_dinero_' + new Date().toISOString().slice(0, 10) + '.' + ext;

function formatearColumna(hoja, letra, formato) {
  const rango = XLSX.utils.decode_range(hoja['!ref']);
  for (let f = 1; f <= rango.e.r; f++) {
    const celda = hoja[letra + (f + 1)];
    if (celda && celda.t === 'n') celda.z = formato;
  }
}

function exportarExcel() {
  if (!movimientos.length) {
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
    ['Generado el', fechaLegible(new Date().toISOString().slice(0, 10))],
    [],
    ['Concepto', 'Monto'],
    ['Total de entradas', ingresos],
    ['Total de salidas', gastos],
    ['Saldo disponible', ingresos - gastos],
    [],
    ['Movimientos registrados', movimientos.length],
  ]);
  resumen['!cols'] = [{ wch: 26 }, { wch: 16 }];
  ['B5', 'B6', 'B7'].forEach((r) => { if (resumen[r]) resumen[r].z = FMT_MONEDA; });
  XLSX.utils.book_append_sheet(libro, resumen, 'Resumen');

  /* Hoja 2: Movimientos con detalle */
  const filas = [[
    '#', 'Fecha', 'Hora de registro', 'Tipo', 'Seccion / Categoria',
    'Nombre', 'Motivo de la salida', 'Entrada', 'Salida', 'Saldo acumulado',
  ]];

  let saldo = 0;
  movimientos
    .slice()
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || momentoDe(a) - momentoDe(b))
    .forEach((m, i) => {
      const esGasto = m.tipo === 'gasto';
      saldo += esGasto ? -m.cantidad : m.cantidad;
      filas.push([
        i + 1,
        m.fecha,
        horaLegible(m),
        esGasto ? 'Salida' : 'Entrada',
        esGasto ? buscarCategoria(m.categoria).nombre : '',
        nombreDe(m),
        esGasto ? m.motivo || '' : '',
        esGasto ? null : m.cantidad,
        esGasto ? m.cantidad : null,
        saldo,
      ]);
    });

  filas.push([]);
  filas.push(['', '', '', '', '', '', 'TOTALES', ingresos, gastos, ingresos - gastos]);

  const hojaMov = XLSX.utils.aoa_to_sheet(filas);
  hojaMov['!cols'] = [
    { wch: 5 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 22 },
    { wch: 30 }, { wch: 48 }, { wch: 14 }, { wch: 14 }, { wch: 17 },
  ];
  ['H', 'I', 'J'].forEach((c) => formatearColumna(hojaMov, c, FMT_MONEDA));
  hojaMov['!autofilter'] = { ref: 'A1:J' + (filas.length - 2) };
  XLSX.utils.book_append_sheet(libro, hojaMov, 'Movimientos');

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
  if (!movimientos.length) {
    alert('No hay movimientos para exportar.');
    return;
  }

  const filas = [[
    'Fecha', 'Hora de registro', 'Tipo', 'Seccion / Categoria',
    'Nombre', 'Motivo de la salida', 'Cantidad',
  ]];

  movimientos
    .slice()
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || momentoDe(a) - momentoDe(b))
    .forEach((m) => {
      const esGasto = m.tipo === 'gasto';
      filas.push([
        m.fecha,
        horaLegible(m),
        esGasto ? 'Salida' : 'Entrada',
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

  const { almacen: elegido, aviso } = await crearAlmacen();
  almacen = elegido;

  $('btnAcceder').disabled = false;
  $('btnAcceder').textContent = 'Entrar';

  // Deja ver de dónde salen los datos, para no confundir "modo local"
  // con "ya está en la nube".
  $('insigniaModo').textContent = almacen.modo === 'firebase'
    ? 'Conectado a Firebase'
    : 'Modo local (este navegador)';
  $('insigniaModo').classList.toggle('local', almacen.modo === 'local');

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
