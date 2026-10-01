/* ===== Configuración de Firebase =====
   ESTE ES EL ÚNICO ARCHIVO QUE TIENES QUE EDITAR TÚ.

   Mientras los campos estén vacíos, la aplicación funciona en "modo
   local": las cuentas y los movimientos se guardan solo en este
   navegador, igual que hasta ahora. En cuanto pegues los datos de tu
   proyecto, pasa sola a usar Firebase.

   Cómo conseguir estos datos (paso a paso en LEEME.md):
     console.firebase.google.com  ->  tu proyecto
     ->  ⚙ Configuración del proyecto  ->  Tus apps  ->  app web
     ->  copia el objeto "firebaseConfig" y pégalo aquí abajo.

   No es secreto: estas claves van a la vista en cualquier página web
   que use Firebase. Lo que protege tus datos son las reglas de
   seguridad del archivo firestore.rules, no ocultar esto. */

export const configFirebase = {
  apiKey: 'AIzaSyC9i1fj3cPzJbc1-1NDJhI0hIx2H25D3N0',
  authDomain: 'control-gastos-769cb.firebaseapp.com',
  projectId: 'control-gastos-769cb',
  storageBucket: 'control-gastos-769cb.firebasestorage.app',
  messagingSenderId: '251124744956',
  appId: '1:251124744956:web:3002850b0858b23f148d79',
};

/* Versión del SDK de Firebase que se carga desde internet.
   Si en la consola del navegador aparece un error diciendo que no se
   pudo cargar Firebase, lo más probable es que esta versión ya no
   exista: busca la actual en firebase.google.com/docs/web/setup
   y cambia solo este número. */
export const VERSION_FIREBASE = '11.0.0';

// Se considera configurado cuando están los tres datos imprescindibles.
export const hayConfigFirebase = () =>
  Boolean(configFirebase.apiKey && configFirebase.authDomain && configFirebase.projectId);
