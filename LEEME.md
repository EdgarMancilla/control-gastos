# Control de gastos — cómo ponerlo en marcha

La aplicación funciona **ya mismo en modo local** (cuentas y movimientos guardados
en tu navegador). Cuando completes los pasos de Firebase, pasa sola a guardar todo
en la nube, sin tocar más código.

---

## 1. Verla funcionando ahora mismo

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

## 2. Crear el proyecto en Firebase

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

## 3. Comprobar que quedó conectado

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

## 3b. Comprobarlo usando la app

Recarga la página. Abajo del formulario de acceso, la etiqueta debe decir
**«Conectado a Firebase»** en lugar de «Modo local».

Crea una cuenta de prueba y registra un movimiento. En la consola de Firebase, en
**Firestore Database**, debe aparecer:

```
usuarios / {identificador de tu cuenta} / movimientos / {el movimiento}
```

---

## 4. Publicarla en internet (opcional)

Para entrar desde el celular o desde otra computadora, la página tiene que estar
publicada. Lo más directo es usar el hospedaje del propio Firebase:

```
npm install -g firebase-tools
firebase login
firebase init hosting     # carpeta pública: . (el punto)
firebase deploy
```

Te dará una dirección `https://tu-proyecto.web.app`. Esa dirección ya queda
autorizada para el inicio de sesión automáticamente.

Si prefieres Netlify o Vercel, también funcionan; en ese caso agrega el dominio en
**Authentication → Settings → Dominios autorizados**.

---

## Pasar los datos que ya tienes

Lo que esté guardado en el navegador **no se sube solo** a Firebase. Para pasarlo,
abre **`http://localhost:3000/importar.html`**:

1. Entra con la cuenta de Firebase donde quieres que queden los movimientos.
2. La página busca todo lo guardado en este navegador y te lo muestra agrupado,
   con cuántos movimientos tiene cada grupo.
3. Marca los que quieras y pulsa **Subir a mi cuenta**.

Importante: **úsala desde el mismo navegador y la misma computadora** donde capturaste
los movimientos, porque es ahí donde están guardados. Si subes dos veces el mismo grupo
quedarán duplicados; la página te avisa si detecta que ya importaste antes.

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
| `prototipo-1/` | El primer diseño, guardado como referencia |

---

## Si algo falla

| Lo que ves | Qué revisar |
|---|---|
| Sigue diciendo «Modo local» | Faltan datos en `firebase-config.js`, o tienen comillas mal puestas |
| «No se pudo cargar Firebase» | Cambia `VERSION_FIREBASE` en `firebase-config.js` por la versión actual del SDK |
| «Falta activar Correo electrónico/contraseña» | Paso 5: actívalo en Authentication |
| «La base de datos rechazó la operación» | Paso 11: faltan publicar las reglas |
| La página aparece en blanco | La estás abriendo con doble clic; sírvela con `npx serve` |
