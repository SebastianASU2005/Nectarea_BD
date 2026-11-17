// Utilidades compartidas. Genera JWT de prueba con el MISMO JWT_SECRET del backend que estés probando.
// ⚠️ Usar SOLO contra un backend local o de staging (nunca producción).
const jwt = require("jsonwebtoken");

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error("Falta JWT_SECRET (el mismo del backend bajo prueba). Ej: JWT_SECRET=xxxx node run.js me 50 10");
  process.exit(1);
}
if (/produccion|production|railway\.app/i.test(BASE)) {
  console.error("BASE apunta a producción. Abortado: estas pruebas generan carga masiva y datos de prueba.");
  process.exit(1);
}

// token_version debe coincidir con el del usuario en la BD (por defecto 0).
const tokenFor = (id, rol = "cliente", tokenVersion = 0) =>
  jwt.sign({ id, nombre_usuario: "user" + id, rol, token_version: tokenVersion }, SECRET, { expiresIn: "2h", algorithm: "HS256" });

// IP aleatoria: el rate limiter global es 100 req/min POR IP; sin esto todo daría 429.
const randIp = () => `10.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${((Math.random() * 254) | 0) + 1}`;

module.exports = { BASE, tokenFor, randIp };
