// Archivo: utils/bcrypt.js
//
// ⚡ PERFORMANCE — bcrypt nativo con fallback automático a bcryptjs.
//
// `bcryptjs` es JavaScript puro: cada hash/compare (~60-100 ms de CPU a costo 10) se ejecuta en
// el hilo principal y BLOQUEA el event loop. Medido: 20 logins simultáneos congelaron toda la API
// durante 1.28 s. `bcrypt` (nativo) trabaja en el threadpool de libuv y no bloquea (10 ms).
//
// Los hashes son 100 % compatibles ($2a/$2b): las contraseñas ya guardadas siguen funcionando.
// Si `bcrypt` no está instalado o no compila en el servidor, se usa bcryptjs como antes.

let impl;
try {
  impl = require("bcrypt");
} catch (e) {
  impl = require("bcryptjs");
  console.warn(
    "[bcrypt] Módulo nativo 'bcrypt' no disponible; se usa 'bcryptjs' (más lento y bloquea el event loop).",
  );
}

module.exports = impl;
