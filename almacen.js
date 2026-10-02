/* ===== Capa de guardado =====
   La aplicación no sabe si detrás hay Firebase o el navegador: solo
   habla con esta interfaz. Eso permite cambiar de una a otra sin
   tocar el resto del código, y seguir trabajando aunque Firebase
   todavía no esté configurado.

   Interfaz que ambas implementaciones cumplen:

     modo                      'firebase' | 'local'
     observarSesion(callback)  avisa con el usuario actual, o null
     crearCuenta(correo, clave)
     entrar(correo, clave)
     salir()
     recuperar(correo)         correo para restablecer contraseña
     listar()                  -> [movimientos]
     agregar(movimiento)       -> movimiento guardado (con su id)
     actualizar(id, cambios)   -> movimiento ya modificado
     borrar(id)

     listarCuentas()           -> [cuentas donde se guarda el dinero]
     agregarCuenta(cuenta)     -> cuenta guardada (con su id)
     actualizarCuenta(id, c)   -> cuenta ya modificada
     borrarCuenta(id)

   Las que pueden fallar devuelven { ok, mensaje }. */

import { configFirebase, hayConfigFirebase, VERSION_FIREBASE } from './firebase-config.js';

/* ---------- Validaciones comunes ---------- */

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function revisarCredenciales(correo, clave) {
  if (!CORREO_VALIDO.test(correo)) return 'Escribe un correo válido.';
  if (clave.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
  return null;
}

/* ---------- Implementación con Firebase ---------- */

// Traduce los códigos de Firebase a algo que se entienda.
const MENSAJES = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/invalid-email': 'Ese correo no tiene un formato válido.',
  'auth/user-not-found': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Inicia sesión.',
  'auth/weak-password': 'La contraseña es demasiado débil: usa al menos 6 caracteres.',
  'auth/too-many-requests': 'Demasiados intentos seguidos. Espera un momento y vuelve a probar.',
  'auth/network-request-failed': 'Sin conexión con el servidor. Revisa tu internet.',
  'auth/operation-not-allowed':
    'Falta activar "Correo electrónico/contraseña" en Firebase → Authentication → Sign-in method.',
  'permission-denied':
    'La base de datos rechazó la operación. Revisa que hayas publicado las reglas de firestore.rules.',
  'unavailable': 'Sin conexión con la base de datos. Los cambios se enviarán al volver la conexión.',
};

const traducir = (error) =>
  MENSAJES[error && error.code] || (error && error.message) || 'Ocurrió un error inesperado.';

async function crearAlmacenFirebase() {
  const base = 'https://www.gstatic.com/firebasejs/' + VERSION_FIREBASE + '/';

  let appMod, authMod, dbMod;
  try {
    [appMod, authMod, dbMod] = await Promise.all([
      import(base + 'firebase-app.js'),
      import(base + 'firebase-auth.js'),
      import(base + 'firebase-firestore.js'),
    ]);
  } catch (error) {
    throw new Error(
      'No se pudo cargar Firebase ' + VERSION_FIREBASE + '. Comprueba tu conexión, o cambia ' +
      'VERSION_FIREBASE en firebase-config.js por una versión que exista. (' + error.message + ')'
    );
  }

  const app = appMod.initializeApp(configFirebase);
  const auth = authMod.getAuth(app);

  // La caché local deja seguir trabajando sin internet: lo capturado
  // se guarda y se sincroniza solo cuando vuelve la conexión.
  let db;
  try {
    db = dbMod.initializeFirestore(app, {
      localCache: dbMod.persistentLocalCache(),
    });
  } catch {
    db = dbMod.getFirestore(app);
  }

  const coleccion = (nombre = 'movimientos') =>
    dbMod.collection(db, 'usuarios', auth.currentUser.uid, nombre);

  const documento = (nombre, id) =>
    dbMod.doc(db, 'usuarios', auth.currentUser.uid, nombre, String(id));

  return {
    modo: 'firebase',

    observarSesion(callback) {
      authMod.onAuthStateChanged(auth, (usuario) => {
        callback(usuario ? { id: usuario.uid, correo: usuario.email } : null);
      });
    },

    async crearCuenta(correo, clave) {
      try {
        await authMod.createUserWithEmailAndPassword(auth, correo, clave);
        return { ok: true };
      } catch (error) {
        return { ok: false, mensaje: traducir(error) };
      }
    },

    async entrar(correo, clave) {
      try {
        await authMod.signInWithEmailAndPassword(auth, correo, clave);
        return { ok: true };
      } catch (error) {
        return { ok: false, mensaje: traducir(error) };
      }
    },

    async salir() {
      await authMod.signOut(auth);
    },

    async recuperar(correo) {
      try {
        await authMod.sendPasswordResetEmail(auth, correo);
        return { ok: true, mensaje: 'Te enviamos un correo para restablecer tu contraseña.' };
      } catch (error) {
        return { ok: false, mensaje: traducir(error) };
      }
    },

    async listar() {
      const captura = await dbMod.getDocs(coleccion());
      return captura.docs.map((d) => ({ id: d.id, ...d.data() }));
    },

    async agregar(movimiento) {
      // El id lo pone Firestore; no se envía el que traiga el objeto.
      const { id, ...datos } = movimiento;
      const ref = await dbMod.addDoc(coleccion(), datos);
      return { ...datos, id: ref.id };
    },

    async actualizar(id, cambios) {
      // El id no viaja dentro del documento: identifica, no es un dato.
      const { id: _, ...datos } = cambios;
      // setDoc reemplaza el documento entero, para que al pasar de
      // salida a entrada no queden colgando la categoria y el motivo.
      await dbMod.setDoc(documento('movimientos', id), datos);
      return { ...datos, id };
    },

    async borrar(id) {
      await dbMod.deleteDoc(documento('movimientos', id));
    },

    /* --- Cuentas donde se guarda el dinero --- */

    async listarCuentas() {
      const captura = await dbMod.getDocs(coleccion('cuentas'));
      return captura.docs.map((d) => ({ id: d.id, ...d.data() }));
    },

    async agregarCuenta(cuenta) {
      const { id, ...datos } = cuenta;
      const ref = await dbMod.addDoc(coleccion('cuentas'), datos);
      return { ...datos, id: ref.id };
    },

    async actualizarCuenta(id, cambios) {
      const { id: _, ...datos } = cambios;
      await dbMod.setDoc(documento('cuentas', id), datos);
      return { ...datos, id };
    },

    async borrarCuenta(id) {
      await dbMod.deleteDoc(documento('cuentas', id));
    },
  };
}

/* ---------- Implementación local (sin servidor) ----------
   Es la que ya venía funcionando: cuentas y movimientos en este
   navegador. Sirve para trabajar antes de configurar Firebase, y
   como referencia de lo que la otra implementación debe cumplir. */

const CLAVE_CUENTAS = 'cuentas_v2';
const CLAVE_SESION = 'sesion_v2';
const CLAVE_DATOS_ANTIGUA = 'movimientos_v1';
const CLAVE_MIGRACION = 'migracion_v2';
const ITERACIONES = 150000;

const claveDatos = (id) => 'movimientos_v2::' + id;
const claveCuentas = (id) => 'cuentas_datos_v1::' + id;

function leerJSON(clave, porDefecto) {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? JSON.parse(texto) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribirJSON(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

const aHex = (buffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function derivar(clave, salHex) {
  const sal = new Uint8Array(salHex.match(/../g).map((h) => parseInt(h, 16)));
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sal, iterations: ITERACIONES, hash: 'SHA-256' }, base, 256
  );
  return aHex(bits);
}

// Compara sin cortar al primer carácter distinto, para no filtrar
// por tiempo cuánto se acertó de la contraseña.
function igualSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let distintos = 0;
  for (let i = 0; i < a.length; i++) distintos |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return distintos === 0;
}

function crearAlmacenLocal() {
  const cuentas = () => leerJSON(CLAVE_CUENTAS, {}) || {};
  const normalizar = (correo) => correo.trim().toLowerCase();

  let sesion = null;
  let avisarSesion = () => {};

  // Los movimientos capturados antes de que hubiera cuentas pasan a
  // la primera que se cree, una sola vez.
  function migrarAntiguos(id) {
    if (localStorage.getItem(CLAVE_MIGRACION)) return 0;

    const viejos = leerJSON(CLAVE_DATOS_ANTIGUA, null);
    try {
      localStorage.setItem(CLAVE_MIGRACION, id);
    } catch { /* sin almacenamiento no hay nada que migrar */ }

    if (!Array.isArray(viejos) || !viejos.length) return 0;
    escribirJSON(claveDatos(id), viejos);
    return viejos.length;
  }

  function abrir(correo) {
    sesion = { id: correo, correo };
    try {
      localStorage.setItem(CLAVE_SESION, correo);
    } catch { /* la sesión durará lo que la pestaña */ }
    avisarSesion(sesion);
  }

  return {
    modo: 'local',

    observarSesion(callback) {
      avisarSesion = callback;
      let guardada = null;
      try {
        guardada = localStorage.getItem(CLAVE_SESION);
      } catch { /* sin almacenamiento siempre se pide entrar */ }

      sesion = guardada && cuentas()[guardada] ? { id: guardada, correo: guardada } : null;
      callback(sesion);
    },

    async crearCuenta(correo, clave) {
      correo = normalizar(correo);
      const registro = cuentas();
      if (registro[correo]) {
        return { ok: false, mensaje: 'Ya existe una cuenta con ese correo. Inicia sesión.' };
      }

      const salHex = aHex(crypto.getRandomValues(new Uint8Array(16)));
      registro[correo] = {
        sal: salHex,
        hash: await derivar(clave, salHex),
        iteraciones: ITERACIONES,
        creada: new Date().toISOString(),
      };

      if (!escribirJSON(CLAVE_CUENTAS, registro)) {
        return { ok: false, mensaje: 'El navegador no permite guardar datos de esta página.' };
      }

      const rescatados = migrarAntiguos(correo);
      abrir(correo);
      return { ok: true, rescatados };
    },

    async entrar(correo, clave) {
      correo = normalizar(correo);
      const cuenta = cuentas()[correo];
      // Mismo mensaje exista o no la cuenta: no delata qué correos hay.
      const malas = { ok: false, mensaje: 'Correo o contraseña incorrectos.' };
      if (!cuenta) return malas;

      const hash = await derivar(clave, cuenta.sal);
      if (!igualSeguro(hash, cuenta.hash)) return malas;

      abrir(correo);
      return { ok: true };
    },

    async salir() {
      sesion = null;
      try {
        localStorage.removeItem(CLAVE_SESION);
      } catch { /* nada que limpiar */ }
      avisarSesion(null);
    },

    async recuperar() {
      return {
        ok: false,
        mensaje: 'Sin servidor no se puede recuperar una contraseña. ' +
          'Esto funcionará cuando conectes Firebase.',
      };
    },

    async listar() {
      if (!sesion) return [];
      const datos = leerJSON(claveDatos(sesion.id), []);
      return Array.isArray(datos) ? datos : [];
    },

    async agregar(movimiento) {
      const lista = await this.listar();
      const guardado = { ...movimiento, id: movimiento.id || String(Date.now()) };
      lista.push(guardado);
      escribirJSON(claveDatos(sesion.id), lista);
      return guardado;
    },

    async actualizar(id, cambios) {
      const lista = await this.listar();
      const actualizado = { ...cambios, id };
      escribirJSON(
        claveDatos(sesion.id),
        lista.map((m) => (String(m.id) === String(id) ? actualizado : m))
      );
      return actualizado;
    },

    async borrar(id) {
      const lista = await this.listar();
      escribirJSON(claveDatos(sesion.id), lista.filter((m) => String(m.id) !== String(id)));
    },

    /* --- Cuentas donde se guarda el dinero --- */

    async listarCuentas() {
      if (!sesion) return [];
      const datos = leerJSON(claveCuentas(sesion.id), []);
      return Array.isArray(datos) ? datos : [];
    },

    async agregarCuenta(cuenta) {
      const lista = await this.listarCuentas();
      const guardada = { ...cuenta, id: cuenta.id || 'c' + Date.now() };
      lista.push(guardada);
      escribirJSON(claveCuentas(sesion.id), lista);
      return guardada;
    },

    async actualizarCuenta(id, cambios) {
      const lista = await this.listarCuentas();
      const actualizada = { ...cambios, id };
      escribirJSON(
        claveCuentas(sesion.id),
        lista.map((c) => (String(c.id) === String(id) ? actualizada : c))
      );
      return actualizada;
    },

    async borrarCuenta(id) {
      const lista = await this.listarCuentas();
      escribirJSON(claveCuentas(sesion.id), lista.filter((c) => String(c.id) !== String(id)));
    },
  };
}

/* ---------- Elección ----------
   Si Firebase está configurado se usa; si falla al cargar, se avisa
   y se sigue en local en lugar de dejar la página muerta. */

/* Abrir la página con ?local al final de la dirección fuerza el modo
   local aunque Firebase esté configurado. Sirve para probar cambios
   sin tocar los datos de verdad: lo que captures ahí se queda en este
   navegador y no sube a ningún lado.

       http://localhost:3000/?local                                  */
function pidenModoLocal() {
  try {
    return new URLSearchParams(location.search).has('local');
  } catch {
    return false;
  }
}

export async function crearAlmacen() {
  // Estar en local con Firebase configurado significa que se pidió a
  // propósito: conviene avisarlo distinto, para que nadie capture algo
  // de verdad creyendo que se está guardando en la nube.
  const esPrueba = pidenModoLocal() && hayConfigFirebase();

  if (pidenModoLocal() || !hayConfigFirebase()) {
    return { almacen: crearAlmacenLocal(), aviso: null, esPrueba };
  }
  try {
    return { almacen: await crearAlmacenFirebase(), aviso: null, esPrueba: false };
  } catch (error) {
    return { almacen: crearAlmacenLocal(), aviso: error.message, esPrueba: false };
  }
}
