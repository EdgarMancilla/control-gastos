/* Servidor local mínimo para ver la aplicación.
   Se usa así, desde esta carpeta:

       node servidor.js

   Luego abre http://localhost:3000 en el navegador.
   Para detenerlo: Ctrl + C en la terminal.

   Hace falta porque la página usa módulos de JavaScript, y los
   navegadores no los cargan si el archivo se abre con doble clic. */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PUERTO = 3000;
const CARPETA = __dirname;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const servidor = http.createServer((peticion, respuesta) => {
  let ruta = decodeURIComponent(peticion.url.split('?')[0]);
  if (ruta === '/') ruta = '/index.html';

  const archivo = path.join(CARPETA, ruta);

  // No dejar salir de la carpeta del proyecto.
  if (!archivo.startsWith(CARPETA)) {
    respuesta.writeHead(403);
    return respuesta.end('prohibido');
  }

  fs.readFile(archivo, (error, datos) => {
    if (error) {
      respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return respuesta.end('No se encontró ' + ruta);
    }
    respuesta.writeHead(200, {
      'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    respuesta.end(datos);
  });
});

servidor.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('El puerto ' + PUERTO + ' ya está ocupado.');
    console.error('Cierra el otro servidor, o cambia PUERTO arriba en este archivo.');
  } else {
    console.error('Error al arrancar:', error.message);
  }
  process.exit(1);
});

servidor.listen(PUERTO, () => {
  console.log('');
  console.log('  Aplicación:   http://localhost:' + PUERTO);
  console.log('  Diagnóstico:  http://localhost:' + PUERTO + '/diagnostico.html');
  console.log('  Importador:   http://localhost:' + PUERTO + '/importar.html');
  console.log('');
  console.log('  Para detenerlo: Ctrl + C');
  console.log('');
});
