# Control de gastos

**En línea:** https://edgarmancilla.github.io/control-gastos/

Aplicación para llevar el control de entradas y salidas de dinero, con las salidas
clasificadas por secciones y un motivo obligatorio en cada una.

## Qué se puede hacer

- **Cuentas de dinero**: registra dónde guardas el dinero (bancos, efectivo, tarjetas),
  cada una con su saldo inicial. La tarjeta **Mis cuentas** muestra el saldo de cada una
  en barras, y el saldo total es la suma de todas.
- **Registrar** entradas y salidas, indicando siempre **en qué cuenta** entra o de cuál
  sale, además de fecha, nombre y —en las salidas— sección y motivo.
- **Traspasos** entre cuentas: mover dinero del banco al efectivo no cuenta como ingreso
  ni como gasto, solo cambia de sitio. Los totales del mes no se inflan por ello.
- **Filtrar por cuenta**, igual que por mes: la cifra pasa a ser el saldo de esa cuenta
  y todo lo demás se acota a sus movimientos.
- **Editar** cualquier movimiento ya registrado: el botón ✏️ lo carga en el formulario.
  Se puede incluso cambiar una salida a entrada; los datos que dejan de aplicar se van.
- **Filtrar por mes**: el desplegable junto a la cifra principal afecta a todo a la vez
  —el balance, las barras por sección, el historial y lo que se exporta a Excel o CSV.
  Con un mes elegido, la cifra grande pasa a ser el balance de ese mes y el saldo
  acumulado se enseña aparte, para no confundirlos.
- **Exportar** a Excel (cuatro hojas: resumen, movimientos con detalle, saldo de cada
  cuenta y salidas por sección) o a CSV.
- **Tema claro y oscuro**, que sigue al del sistema hasta que elijas uno.
- Pensada también **para el móvil**: comprobada sin desbordes desde 320px de ancho.

Las cuentas y los movimientos viven en **Firebase** (proyecto `control-gastos-769cb`),
así que los datos están disponibles desde cualquier dispositivo y cada cuenta ve
únicamente los suyos.

## Estado de la configuración

| | Paso | Estado |
|---|---|---|
| ✅ | Proyecto de Firebase creado | `control-gastos-769cb` |
| ✅ | Authentication con correo y contraseña | Habilitado |
| ✅ | Base de datos Firestore | Creada |
| ⚠️ | Reglas de seguridad publicadas | **Cambiaron con las cuentas: hay que volver a pegarlas** |
| ✅ | Dominio autorizado | `edgarmancilla.github.io` |
| ✅ | Publicado en GitHub Pages | Rama `main`, carpeta raíz |

Lo que sigue en este archivo es la referencia de cómo se hizo, por si alguna vez hay
que rehacerlo o mover el proyecto a otra cuenta.

---

## Probar sin tocar Firebase

Tres formas, de la más rápida a la más completa.

### 1. Modo local en el navegador

Añade `?local` al final de la dirección:

```
http://localhost:3000/?local
```

La app funciona igual, pero cuentas, movimientos y saldos se guardan **solo en este
navegador**: no se envía nada a Firebase y no tocas tus datos de verdad. La etiqueta
de abajo del formulario dirá «Modo local (este navegador)» en vez de «Conectado a
Firebase», así que no hay forma de confundirse.

Sirve para probar cambios, enseñar la app a alguien, o capturar datos de ejemplo sin
ensuciar los reales. Para volver a lo normal, quita el `?local`.

### 2. Las pruebas automáticas

```
npm install     (solo la primera vez)
npm test
```

Corren **82 comprobaciones** sin internet, sin Firebase y sin navegador: cargan la
página real en un DOM simulado y la usan como lo haría una persona. Tardan unos
segundos.

Lo que cubren:

| Batería | Qué revisa |
|---|---|
| `pruebas/01-acceso.js` | Validaciones, que la contraseña no se guarde en claro, rechazo de credenciales malas, aislamiento entre cuentas, sesión persistente |
| `pruebas/02-movimientos.js` | Editar sin duplicar, cambiar una salida a entrada, filtro por mes afectando a totales, gráfica e historial |
| `pruebas/03-cuentas.js` | Saldos con saldo inicial, traspasos que no alteran el total, filtro por cuenta, borrar cuentas sin perder movimientos |

Para correr una sola: `node pruebas/01-acceso.js`.

**Pásalas antes de cada `git push`.** Es lo que evita romper el inicio de sesión al
tocar otra cosa.

### 3. El emulador de Firebase (opcional)

Las dos formas anteriores no prueban una parte importante: **las reglas de seguridad**.
Para eso está el emulador, que levanta un Firebase completo en tu computadora:

```
npm install -g firebase-tools
firebase init emulators      # marca Authentication y Firestore
firebase emulators:start
```

Necesita **Java instalado** (el emulador de Firestore corre sobre Java). Es la única
manera de comprobar que las reglas hacen lo que crees sin arriesgar los datos reales.
Si lo quieres montar, dímelo y te conecto la app al emulador.

---

## Trabajar en el código

La página usa módulos de JavaScript, así que **no se puede abrir con doble clic**.
Desde esta carpeta:

```
node servidor.js
```

Y abre http://localhost:3000. Para publicar los cambios:

```
git add .
git commit -m "describe el cambio"
git push
```

GitHub Pages se actualiza solo en un par de minutos.

---

## Referencia: ver la app en local

Desde que la página usa módulos de JavaScript, **ya no se puede abrir con doble clic**
en el archivo: los navegadores lo bloquean por seguridad. Hay que servirla. En la
carpeta del proyecto, abre una terminal y ejecuta:

```
npx serve
```

Te dará una dirección tipo `http://localhost:3000`. Ábrela en el navegador.

> Si no tienes Node instalado, bájalo de nodejs.org. Cualquier otro servidor estático
> sirve igual.

---

## Referencia: cómo se configuró Firebase

1. Entra a **console.firebase.google.com** con tu cuenta de Google.
2. **Agregar proyecto** → ponle un nombre (por ejemplo `control-gastos`).
3. Lo de Google Analytics puedes desactivarlo: no hace falta.

### Activar el inicio de sesión

4. En el menú lateral: **Compilación → Authentication → Comenzar**.
5. En la pestaña **Sign-in method**, elige **Correo electrónico/contraseña**,
   actívalo y guarda.

### Crear la base de datos

6. En el menú lateral: **Compilación → Firestore Database → Crear base de datos**.
7. Elige la ubicación más cercana (por ejemplo `nam5` o `us-central`).
8. Cuando pregunte por el modo, elige **modo de producción** (cerrado). Las reglas
   correctas las pones en el paso 11.

### Registrar la aplicación web

9. Rueda dentada ⚙ (arriba a la izquierda) → **Configuración del proyecto**.
10. Baja hasta **Tus apps** → icono **`</>`** (web) → ponle un apodo → **Registrar app**.
    Te mostrará un bloque parecido a este:

    ```js
    const firebaseConfig = {
      apiKey: "AIza...",
      authDomain: "control-gastos.firebaseapp.com",
      projectId: "control-gastos",
      storageBucket: "control-gastos.appspot.com",
      messagingSenderId: "123456789",
      appId: "1:123:web:abc"
    };
    ```

    **Copia esos valores dentro de `firebase-config.js`**, respetando las comillas.
    Es el único archivo que debes editar.

### Publicar las reglas de seguridad

11. **Firestore Database → pestaña Reglas** → borra lo que haya, pega **todo el
    contenido de `firestore.rules`** → **Publicar**.

> Este paso no es opcional. Sin él, o nadie puede guardar nada, o cualquiera puede
> leer los datos de los demás. Las reglas son lo único que de verdad protege la
> información: el código de la página lo puede modificar cualquiera desde su navegador.

---

## Referencia: comprobar que la conexión funciona

Abre **`http://localhost:3000/diagnostico.html`**. Te dirá en cuatro líneas qué parte
ya funciona y cuál falta:

| Lo que dice | Qué significa |
|---|---|
| `3. Authentication responde: auth/invalid-credential` o `auth/user-not-found` | ✅ El inicio de sesión ya está activo |
| `3. Authentication responde: auth/operation-not-allowed` o `auth/configuration-not-found` | ❌ Falta el paso 5: activar Correo/contraseña |
| `4. Firestore responde: permission-denied` | ✅ La base existe y las reglas protegen los datos |
| `4. Firestore: lectura SIN SESIÓN permitida` | ⚠️ Las reglas están abiertas: repite el paso 11 |
| `4. Firestore responde: not-found` o se queda esperando | ❌ Falta crear la base de datos (paso 6) |

Esa página no crea ni modifica nada: solo pregunta y reporta. Puedes borrarla cuando
todo esté en orden.

### Comprobarlo usando la app

Recarga la página. Abajo del formulario de acceso, la etiqueta debe decir
**«Conectado a Firebase»** en lugar de «Modo local».

Crea una cuenta de prueba y registra un movimiento. En la consola de Firebase, en
**Firestore Database**, debe aparecer:

```
usuarios / {identificador de tu cuenta} / movimientos / {el movimiento}
```

---

## Referencia: cómo está publicada

Está en **GitHub Pages**, desde el repositorio `EdgarMancilla/control-gastos`:

- **Settings → Pages → Source:** Deploy from a branch, rama `main`, carpeta `/ (root)`
- El campo *Custom domain* queda **vacío** — es solo para dominios propios comprados

Para que el inicio de sesión funcione desde ahí, el dominio está dado de alta en
**Firebase → Authentication → Settings → Dominios autorizados**:

```
edgarmancilla.github.io
```

Va solo el dominio, sin `https://` y sin `/control-gastos`: Firebase compara el
origen, y la ruta no forma parte de él.

Cada `git push` a `main` republica el sitio automáticamente, en un par de minutos.

---

## Qué hace cada archivo

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La estructura de la página |
| `estilos.css` | Todo el diseño, incluidos los temas claro y oscuro |
| `app.js` | La lógica de la aplicación (pantallas, cálculos, Excel) |
| `almacen.js` | Dónde se guardan los datos: Firebase o el navegador |
| `firebase-config.js` | **El único que editas tú**: las claves de tu proyecto |
| `firestore.rules` | Las reglas de seguridad que se pegan en la consola |
| `importar.html` | Sube a Firebase los movimientos guardados en el navegador |
| `diagnostico.html` | Dice qué parte de la configuración ya funciona |
| `pruebas/` | Las pruebas automáticas que corren con npm test |
| `servidor.js` | Servidor local para ver la app mientras trabajas |
| `package.json` | Dependencias de desarrollo y los comandos npm |
| `prototipo-1/` | El primer diseño, guardado como referencia |

---

## Si algo falla

| Lo que ves | Qué revisar |
|---|---|
| Sigue diciendo «Modo local» | Faltan datos en `firebase-config.js`, o tienen comillas mal puestas |
| «No se pudo cargar Firebase» | Cambia `VERSION_FIREBASE` en `firebase-config.js` por la versión actual del SDK |
| «Falta activar Correo electrónico/contraseña» | Paso 5: actívalo en Authentication |
| «La base de datos rechazó la operación» | Paso 11: faltan publicar las reglas |
| La página aparece en blanco | La estás abriendo con doble clic; sírvela con `node servidor.js` |
| Dice «Modo local» y no debería | Quita el `?local` de la dirección |
| `npm test` falla al arrancar | Falta `npm install` |
