/* ===== Control de ingresos y gastos - prototipo ===== */

const CLAVE = 'movimientos_v1';

// Secciones (categorias) para las salidas de dinero.
const CATEGORIAS = [
  { id: 'comida',     nombre: 'Comida y despensa', icono: '🍔', color: '#f59e0b' },
  { id: 'transporte', nombre: 'Transporte',        icono: '🚗', color: '#3b82f6' },
  { id: 'servicios',  nombre: 'Servicios y renta', icono: '🏠', color: '#8b5cf6' },
  { id: 'salud',      nombre: 'Salud',             icono: '💊', color: '#ec4899' },
  { id: 'insumos',    nombre: 'Insumos / negocio', icono: '📦', color: '#14b8a6' },
  { id: 'personal',   nombre: 'Personal / ocio',   icono: '🎮', color: '#eab308' },
  { id: 'otros',      nombre: 'Otros',             icono: '📌', color: '#64748b' },
];

let movimientos = cargar();
let tipoActual = 'ingreso';

/* ---------- Referencias del DOM ---------- */
const $ = (id) => document.getElementById(id);

const form           = $('formMovimiento');
const inpCantidad    = $('cantidad');
const inpFecha       = $('fecha');
const inpConcepto    = $('concepto');
const selCategoria   = $('categoria');
const inpMotivo      = $('motivo');
const grupoCategoria = $('grupoCategoria');
const grupoMotivo    = $('grupoMotivo');
const btnGuardar     = $('btnGuardar');
const lista          = $('listaMovimientos');
const filtro         = $('filtro');

/* ---------- Persistencia ---------- */
function cargar() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) || [];
  } catch {
    return [];
  }
}

function guardar() {
  localStorage.setItem(CLAVE, JSON.stringify(movimientos));
}

/* ---------- Utilidades ---------- */
const dinero = (n) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

const fechaLegible = (iso) => {
  const [a, m, d] = iso.split('-');
  return d + '/' + m + '/' + a;
};

const buscarCategoria = (id) =>
  CATEGORIAS.find((c) => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1];

/* Lectores tolerantes: los movimientos guardados antes de agregar
   el nombre y la hora de registro siguen funcionando. */

// Nombre corto del movimiento. Antes se llamaba "concepto" y solo existia en ingresos.
function nombreDe(m) {
  const n = m.nombre || m.concepto || '';
  if (n) return n;
  return m.tipo === 'gasto' ? buscarCategoria(m.categoria).nombre : 'Ingreso';
}

// Momento exacto de captura. El id es un Date.now(), asi que sirve de respaldo.
function registroDe(m) {
  return new Date(m.registrado || m.id);
}

function horaLegible(m) {
  return registroDe(m).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ---------- Inicializacion ---------- */
function iniciar() {
  CATEGORIAS.forEach((c) => {
    const op = document.createElement('option');
    op.value = c.id;
    op.textContent = c.icono + '  ' + c.nombre;
    selCategoria.appendChild(op);
  });

  inpFecha.value = new Date().toISOString().slice(0, 10);

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => cambiarTipo(tab.dataset.tipo));
  });

  form.addEventListener('submit', alGuardar);
  filtro.addEventListener('change', pintar);
  $('btnExcel').addEventListener('click', exportarExcel);
  $('btnExportar').addEventListener('click', exportarCSV);

  pintar();
}

/* ---------- Cambio de pestana ---------- */
function cambiarTipo(tipo) {
  tipoActual = tipo;

  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('activa', t.dataset.tipo === tipo)
  );

  const esGasto = tipo === 'gasto';

  grupoCategoria.hidden = !esGasto;
  grupoMotivo.hidden    = !esGasto;

  // El nombre corto se pide en los dos tipos, solo cambia como se llama.
  $('etiquetaConcepto').textContent = esGasto ? 'Nombre del gasto' : 'Concepto del ingreso';
  inpConcepto.placeholder = esGasto
    ? 'Ej. Recibo de luz, gasolina, caja de tornillos...'
    : 'Ej. Venta, sueldo, prestamo...';

  // La categoria y el motivo solo son obligatorios en gastos.
  selCategoria.required = esGasto;
  inpMotivo.required    = esGasto;

  btnGuardar.textContent = esGasto ? 'Registrar gasto' : 'Registrar ingreso';
  btnGuardar.classList.toggle('gasto', esGasto);
}

/* ---------- Alta de movimiento ---------- */
function alGuardar(e) {
  e.preventDefault();

  const cantidad = parseFloat(inpCantidad.value);
  if (!cantidad || cantidad <= 0) return;

  const mov = {
    id: Date.now(),
    tipo: tipoActual,
    cantidad: cantidad,
    fecha: inpFecha.value,
    registrado: new Date().toISOString(),
    nombre: inpConcepto.value.trim(),
  };

  if (tipoActual === 'gasto') {
    const motivo = inpMotivo.value.trim();
    if (!motivo) {
      alert('Debes indicar por que se saco el dinero.');
      inpMotivo.focus();
      return;
    }
    mov.categoria = selCategoria.value || 'otros';
    mov.motivo = motivo;
    if (!mov.nombre) mov.nombre = buscarCategoria(mov.categoria).nombre;
  } else if (!mov.nombre) {
    mov.nombre = 'Ingreso';
  }

  movimientos.unshift(mov);
  guardar();
  pintar();

  // Limpiar dejando la fecha elegida.
  const fecha = inpFecha.value;
  form.reset();
  inpFecha.value = fecha;
  inpCantidad.focus();
}

function eliminar(id) {
  if (!confirm('Eliminar este movimiento?')) return;
  movimientos = movimientos.filter((m) => m.id !== id);
  guardar();
  pintar();
}

/* ---------- Render ---------- */
function pintar() {
  pintarTotales();
  pintarLista();
  pintarDesglose();
}

function pintarTotales() {
  const ingresos = movimientos
    .filter((m) => m.tipo === 'ingreso')
    .reduce((s, m) => s + m.cantidad, 0);

  const gastos = movimientos
    .filter((m) => m.tipo === 'gasto')
    .reduce((s, m) => s + m.cantidad, 0);

  $('totalIngresos').textContent = dinero(ingresos);
  $('totalGastos').textContent = dinero(gastos);
  $('saldoTotal').textContent = dinero(ingresos - gastos);
}

function pintarLista() {
  const f = filtro.value;
  const visibles = movimientos
    .filter((m) => f === 'todos' || m.tipo === f)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);

  lista.innerHTML = '';
  $('vacio').hidden = visibles.length > 0;

  visibles.forEach((m) => {
    const esGasto = m.tipo === 'gasto';
    const cat = esGasto ? buscarCategoria(m.categoria) : null;

    const li = document.createElement('li');
    li.className = 'mov ' + m.tipo;

    const icono = document.createElement('div');
    icono.className = 'mov-icono';
    icono.textContent = esGasto ? cat.icono : '💵';

    const info = document.createElement('div');
    info.className = 'mov-info';

    const titulo = document.createElement('div');
    titulo.className = 'mov-titulo';
    titulo.textContent = nombreDe(m);

    const meta = document.createElement('div');
    meta.className = 'mov-meta';
    meta.textContent = esGasto
      ? fechaLegible(m.fecha) + '  ·  ' + cat.nombre
      : fechaLegible(m.fecha);

    info.appendChild(titulo);
    info.appendChild(meta);

    if (esGasto && m.motivo) {
      const motivo = document.createElement('div');
      motivo.className = 'mov-motivo';
      motivo.textContent = '"' + m.motivo + '"';
      info.appendChild(motivo);
    }

    const monto = document.createElement('div');
    monto.className = 'mov-monto';
    monto.textContent = (esGasto ? '- ' : '+ ') + dinero(m.cantidad);

    const borrar = document.createElement('button');
    borrar.className = 'mov-borrar';
    borrar.type = 'button';
    borrar.textContent = '×';
    borrar.title = 'Eliminar';
    borrar.addEventListener('click', () => eliminar(m.id));

    li.appendChild(icono);
    li.appendChild(info);
    li.appendChild(monto);
    li.appendChild(borrar);
    lista.appendChild(li);
  });
}

function pintarDesglose() {
  const cont = $('desglose');
  cont.innerHTML = '';

  const gastos = movimientos.filter((m) => m.tipo === 'gasto');
  $('sinGastos').hidden = gastos.length > 0;
  if (!gastos.length) return;

  const totales = {};
  gastos.forEach((m) => {
    totales[m.categoria] = (totales[m.categoria] || 0) + m.cantidad;
  });

  const total = Object.values(totales).reduce((s, n) => s + n, 0);

  Object.entries(totales)
    .sort((a, b) => b[1] - a[1])
    .forEach((par) => {
      const cat = buscarCategoria(par[0]);
      const monto = par[1];
      const pct = (monto / total) * 100;

      const fila = document.createElement('div');
      fila.className = 'cat-fila';

      const enc = document.createElement('div');
      enc.className = 'cat-encabezado';

      const nombre = document.createElement('span');
      nombre.className = 'cat-nombre';
      nombre.textContent = cat.icono + ' ' + cat.nombre;

      const valor = document.createElement('span');
      valor.className = 'cat-monto';
      valor.textContent = dinero(monto) + '  ·  ' + pct.toFixed(1) + '%';

      enc.appendChild(nombre);
      enc.appendChild(valor);

      const barra = document.createElement('div');
      barra.className = 'cat-barra';

      const relleno = document.createElement('div');
      relleno.className = 'cat-relleno';
      relleno.style.width = pct + '%';
      relleno.style.background = cat.color;

      barra.appendChild(relleno);
      fila.appendChild(enc);
      fila.appendChild(barra);
      cont.appendChild(fila);
    });
}

/* ---------- Exportar a Excel (.xlsx) ---------- */

// Formato de celda para montos: $ 1,234.56 y negativos en rojo.
const FMT_MONEDA = '"$"#,##0.00_);[Red]("$"#,##0.00)';
const FMT_PCT = '0.0%';

function nombreArchivo(ext) {
  return 'control_dinero_' + new Date().toISOString().slice(0, 10) + '.' + ext;
}

// Aplica un formato numerico a una columna completa (saltando el encabezado).
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

  // Si el CDN no cargo (sin internet), usamos el CSV como respaldo.
  if (typeof XLSX === 'undefined') {
    alert(
      'No se pudo cargar el generador de Excel (parece que no hay conexion a internet).\n\n' +
      'Se descargara un archivo CSV que Excel abre sin problema.'
    );
    exportarCSV();
    return;
  }

  const ingresos = movimientos
    .filter((m) => m.tipo === 'ingreso')
    .reduce((s, m) => s + m.cantidad, 0);
  const gastos = movimientos
    .filter((m) => m.tipo === 'gasto')
    .reduce((s, m) => s + m.cantidad, 0);

  const libro = XLSX.utils.book_new();

  /* --- Hoja 1: Resumen --- */
  const resumen = XLSX.utils.aoa_to_sheet([
    ['Resumen de ingresos y gastos'],
    ['Generado el', fechaLegible(new Date().toISOString().slice(0, 10))],
    [],
    ['Concepto', 'Monto'],
    ['Total de ingresos', ingresos],
    ['Total de gastos', gastos],
    ['Saldo actual', ingresos - gastos],
    [],
    ['Movimientos registrados', movimientos.length],
  ]);
  resumen['!cols'] = [{ wch: 26 }, { wch: 16 }];
  ['B5', 'B6', 'B7'].forEach((ref) => {
    if (resumen[ref]) resumen[ref].z = FMT_MONEDA;
  });
  XLSX.utils.book_append_sheet(libro, resumen, 'Resumen');

  /* --- Hoja 2: Movimientos (detalle completo) --- */
  const filas = [[
    '#',
    'Fecha',
    'Hora de registro',
    'Tipo',
    'Seccion / Categoria',
    'Nombre',
    'Motivo de la salida',
    'Ingreso',
    'Gasto',
    'Saldo acumulado',
  ]];

  let saldo = 0;

  movimientos
    .slice()
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
    .forEach((m, i) => {
      const esGasto = m.tipo === 'gasto';
      saldo += esGasto ? -m.cantidad : m.cantidad;

      filas.push([
        i + 1,
        m.fecha,
        horaLegible(m),
        esGasto ? 'Gasto' : 'Ingreso',
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
    { wch: 5 },  // #
    { wch: 12 }, // Fecha
    { wch: 16 }, // Hora
    { wch: 10 }, // Tipo
    { wch: 22 }, // Seccion
    { wch: 30 }, // Nombre
    { wch: 48 }, // Motivo
    { wch: 14 }, // Ingreso
    { wch: 14 }, // Gasto
    { wch: 17 }, // Saldo
  ];
  ['H', 'I', 'J'].forEach((c) => formatearColumna(hojaMov, c, FMT_MONEDA));
  hojaMov['!autofilter'] = { ref: 'A1:J' + (filas.length - 2) };
  XLSX.utils.book_append_sheet(libro, hojaMov, 'Movimientos');

  /* --- Hoja 3: Gastos por seccion --- */
  const totales = {};
  movimientos
    .filter((m) => m.tipo === 'gasto')
    .forEach((m) => {
      totales[m.categoria] = (totales[m.categoria] || 0) + m.cantidad;
    });

  const filasCat = [['Seccion', 'Total gastado', '% del gasto', 'Movimientos']];

  Object.entries(totales)
    .sort((a, b) => b[1] - a[1])
    .forEach((par) => {
      filasCat.push([
        buscarCategoria(par[0]).nombre,
        par[1],
        gastos ? par[1] / gastos : 0,
        movimientos.filter((m) => m.tipo === 'gasto' && m.categoria === par[0]).length,
      ]);
    });

  filasCat.push(['TOTAL', gastos, gastos ? 1 : 0, movimientos.filter((m) => m.tipo === 'gasto').length]);

  const hojaCat = XLSX.utils.aoa_to_sheet(filasCat);
  hojaCat['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 13 }, { wch: 13 }];
  formatearColumna(hojaCat, 'B', FMT_MONEDA);
  formatearColumna(hojaCat, 'C', FMT_PCT);
  XLSX.utils.book_append_sheet(libro, hojaCat, 'Gastos por seccion');

  XLSX.writeFile(libro, nombreArchivo('xlsx'));
}

/* ---------- Exportar a CSV ---------- */
function exportarCSV() {
  if (!movimientos.length) {
    alert('No hay movimientos para exportar.');
    return;
  }

  // Mismas columnas que la hoja "Movimientos" del Excel.
  const filas = [[
    'Fecha', 'Hora de registro', 'Tipo', 'Seccion / Categoria',
    'Nombre', 'Motivo de la salida', 'Cantidad',
  ]];

  movimientos
    .slice()
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
    .forEach((m) => {
      const esGasto = m.tipo === 'gasto';
      filas.push([
        m.fecha,
        horaLegible(m),
        esGasto ? 'Gasto' : 'Ingreso',
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

iniciar();
