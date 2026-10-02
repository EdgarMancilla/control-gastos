/* Une los tres modulos en un script clasico para poder probarlos en
   jsdom, que no carga modulos ES. No cambia la logica: solo quita
   las palabras import/export. */
const fs = require('fs');
const RAIZ = require('path').join(__dirname, '..');

const quitarExport = (s) => s.replace(/^export\s+/gm, '');
const quitarImport = (s) => s.replace(/^import\s+\{[^}]*\}\s+from\s+'[^']+';\s*$/gm, '');

module.exports = function empaquetar() {
  const cfg = quitarExport(fs.readFileSync(RAIZ + '/firebase-config.js', 'utf8'));
  const alm = quitarExport(quitarImport(fs.readFileSync(RAIZ + '/almacen.js', 'utf8')));
  const app = quitarImport(fs.readFileSync(RAIZ + '/app.js', 'utf8'));
  return cfg + '\n' + alm + '\n' + app;
};
