// Uso: JWT_SECRET=... node run.js <escenario> <conexiones> <segundos> [etiqueta]
//   Escenarios: me | cliente | publico_ligero | publico | catalogo | admin | mixto
//   Variables: BASE (default http://127.0.0.1:3000), USER_MAX (ids 2..USER_MAX, default 30000), GZIP=1 (envía Accept-Encoding gzip)
//   Un solo endpoint: ONEPATH=/api/pagos/mis_pagos ONEAUTH=cli node run.js one 30 10
const autocannon = require("autocannon");
const { tokenFor, BASE, randIp } = require("./common");

const [, , scen, conns = "100", secs = "20", label = ""] = process.argv;
const USER_MAX = parseInt(process.env.USER_MAX, 10) || 30000;
const pick = (a) => a[(Math.random() * a.length) | 0];
const uid = () => 2 + ((Math.random() * (USER_MAX - 1)) | 0);

const S = {
  me: { auth: "cli", paths: ["/api/usuarios/me"] },
  cliente: { auth: "cli", paths: ["/api/usuarios/me", "/api/pujas/mis_pujas", "/api/suscripciones/mis_suscripciones", "/api/pagos/mis_pagos", "/api/transacciones/mis_transacciones", "/api/resumen-cuentas/mis_resumenes", "/api/inversiones/mis_inversiones", "/api/adhesion/usuario"] },
  publico: { auth: null, paths: ["/api/proyectos/activos/ahorristas"] },
  publico_ligero: { auth: null, paths: ["/api/proyectos/5/activo", "/api/lotes/50/activo"] },
  catalogo: { auth: "cli", paths: ["/api/proyectos/activos", "/api/lotes/activos"] },
  admin: { auth: "adm", paths: ["/api/usuarios?limit=100", "/api/suscripciones?limit=100"] },
  mixto: { auth: "mix", paths: [] }, // 70% cliente, 20% público liviano, 10% público pesado
};
if (process.env.ONEPATH) S.one = { auth: process.env.ONEAUTH || "cli", paths: [process.env.ONEPATH] };
const sc = S[scen];
if (!sc) { console.error("Escenarios:", Object.keys(S).join(", ")); process.exit(1); }

const inst = autocannon({
  url: BASE, connections: +conns, duration: +secs, timeout: 60,
  requests: [{
    method: "GET",
    setupRequest: (req) => {
      req.headers = { "x-real-ip": randIp(), "accept-encoding": process.env.GZIP ? "gzip" : "identity" };
      if (sc.auth === "mix") {
        const r = Math.random();
        if (r < 0.7) { req.path = pick(S.cliente.paths); req.headers.authorization = "Bearer " + tokenFor(uid()); }
        else if (r < 0.9) req.path = pick(S.publico_ligero.paths);
        else req.path = pick(S.publico.paths);
        return req;
      }
      req.path = pick(sc.paths);
      if (sc.auth === "cli") req.headers.authorization = "Bearer " + tokenFor(uid());
      if (sc.auth === "adm") req.headers.authorization = "Bearer " + tokenFor(1, "admin");
      return req;
    },
  }],
}, (err, r) => {
  if (err) throw err;
  console.log(JSON.stringify({
    label, scen, conns: +conns, rps: +r.requests.average.toFixed(1), p50: r.latency.p50, p97_5: r.latency.p97_5, p99: r.latency.p99,
    max: r.latency.max, ok: r["2xx"], non2xx: r.non2xx, timeouts: r.timeouts, errors: r.errors, MBps: +(r.throughput.average / 1e6).toFixed(1),
  }));
});
autocannon.track(inst, { renderProgressBar: false, renderResultsTable: false });
