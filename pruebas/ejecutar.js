/* Corre las tres baterías de pruebas, una tras otra, y resume.
   No necesita internet ni Firebase: todo pasa en modo local.

       npm test                 (todas)
       node pruebas/01-acceso.js  (solo una)
*/

const { spawnSync } = require('child_process');
const path = require('path');

const BATERIAS = [
  ['01-acceso.js', 'Cuentas de usuario e inicio de sesión'],
  ['02-movimientos.js', 'Edición de movimientos y filtro por mes'],
  ['03-cuentas.js', 'Cuentas de dinero, traspasos y saldos'],
  ['04-service-worker.js', 'App instalable y respeto al tráfico de Firebase'],
];

let fallaron = 0;

BATERIAS.forEach(([archivo, descripcion], i) => {
  console.log('\n' + '═'.repeat(64));
  console.log(' ' + (i + 1) + '/' + BATERIAS.length + '  ' + descripcion);
  console.log('═'.repeat(64));

  const r = spawnSync(process.execPath, [path.join(__dirname, archivo)], {
    stdio: 'inherit',
  });

  if (r.status !== 0) fallaron++;
});

console.log('\n' + '═'.repeat(64));
if (fallaron) {
  console.log(' RESULTADO: ' + fallaron + ' de ' + BATERIAS.length + ' baterías con fallos');
  process.exit(1);
}
console.log(' RESULTADO: todas las baterías pasaron');
