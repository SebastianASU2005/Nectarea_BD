// Integridad de pujas bajo concurrencia: N usuarios pujan A LA VEZ sobre el mismo lote con montos distintos.
// Invariantes: 0 timeouts/5xx · filas en BD == pujas aceptadas · lote.id_puja_mas_alta == puja de mayor monto.
//
// ⚠️ DESTRUCTIVO: borra las pujas del lote indicado y reinicia sus tokens. Usar SOLO en una BD de pruebas.
// Uso:
//   ALLOW_DESTRUCTIVE=yes JWT_SECRET=... DB_HOST=127.0.0.1 DB_USER=.. DB_PASS=.. DB_NAME=.. node race_bids.js <id_lote> <N>
const { Client } = require("pg");
const { tokenFor, BASE, randIp } = require("./common");

if (process.env.ALLOW_DESTRUCTIVE !== "yes") {
  console.error("Este script BORRA pujas del lote indicado. Ejecuta con ALLOW_DESTRUCTIVE=yes y SOLO contra una BD de pruebas.");
  process.exit(1);
}
const LOTE = parseInt(process.argv[2], 10), N = parseInt(process.argv[3], 10) || 40;
if (!LOTE) { console.error("Uso: node race_bids.js <id_lote> <N>"); process.exit(1); }

(async () => {
  const db = new Client({ host: process.env.DB_HOST, port: process.env.DB_PORT || 5432, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
  await db.connect();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const [{ id_proyecto }] = await q("select id_proyecto from lote where id=$1", [LOTE]);
  await q("delete from puja where id_lote=$1", [LOTE]);
  await q("update lote set id_puja_mas_alta=null, estado_subasta='activa' where id=$1", [LOTE]);
  await q("update suscripcion_proyecto set tokens_disponibles=1 where id_proyecto=$1", [id_proyecto]);
  const users = (await q("select id_usuario from suscripcion_proyecto where id_proyecto=$1 and activo order by id limit $2", [id_proyecto, N])).map((r) => r.id_usuario);

  const t0 = Date.now();
  const res = await Promise.all(users.map((u, i) => fetch(BASE + "/api/pujas", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + tokenFor(u), "x-real-ip": randIp() },
    body: JSON.stringify({ id_lote: LOTE, monto_puja: 2000 + i * 10 }),
  }).then(async (r) => ({ s: r.status, b: await r.text() }))));
  const ms = Date.now() - t0;

  const ok = res.filter((r) => r.s === 201).length;
  const timeouts = res.filter((r) => /Operation timeout/i.test(r.b)).length;
  const e5 = res.filter((r) => r.s >= 500).length;
  const [{ n: filas }] = await q("select count(*)::int n from puja where id_lote=$1", [LOTE]);
  const [{ m: maxDB }] = await q("select coalesce(max(monto_puja),0)::float m from puja where id_lote=$1", [LOTE]);
  const [{ a: alta }] = await q("select coalesce(p.monto_puja,0)::float a from lote l left join puja p on p.id=l.id_puja_mas_alta where l.id=$1", [LOTE]);
  const good = alta === maxDB && filas === ok && !timeouts && !e5;
  console.log(`${good ? "✅" : "❌"} ${users.length} pujas simultáneas en ${(ms / 1000).toFixed(1)} s | aceptadas=${ok} filas_BD=${filas} timeouts=${timeouts} 5xx=${e5} | puja_mas_alta=${alta} max_BD=${maxDB}`);
  await db.end();
  process.exit(good ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
