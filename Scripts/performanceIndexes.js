// Archivo: Scripts/performanceIndexes.js
//
// ⚡ PERFORMANCE — Índices faltantes + limpieza de constraints UNIQUE duplicados.
//
// Uso (desde la raíz del proyecto):
//   node Scripts/performanceIndexes.js            -> crea los índices que falten
//   node Scripts/performanceIndexes.js --dedupe   -> además elimina UNIQUE duplicados
//   node Scripts/performanceIndexes.js --dry-run  -> solo muestra qué haría
//
// También lo ejecuta la migración migrations/20261111120000-add-performance-indexes.js
//
// Características:
//  - 100 % idempotente: IF NOT EXISTS. Se puede correr N veces.
//  - CREATE INDEX CONCURRENTLY: NO bloquea lecturas ni escrituras en producción.
//  - Si una tabla/columna no existe en tu BD, la omite y lo informa (no falla).
//  - No modifica datos ni lógica de la aplicación.

require("dotenv").config();

// [tabla, [columnas], opciones]  -> nombre: idx_<tabla>_<col1>_<col2>
const INDEXES = [
  // pago (la tabla más grande: 1 fila por cuota por suscripción)
  ["pago", ["id_usuario"]],
  ["pago", ["id_suscripcion", "estado_pago"]],
  ["pago", ["estado_pago", "fecha_vencimiento"]],
  ["pago", ["id_proyecto"]],

  // transaccion
  ["transaccion", ["id_usuario", "fecha_transaccion"]],
  ["transaccion", ["id_suscripcion"]],
  ["transaccion", ["id_puja"]],
  ["transaccion", ["id_inversion"]],
  ["transaccion", ["id_pago_mensual"]],
  ["transaccion", ["id_proyecto"]],
  ["transaccion", ["estado_transaccion", "fecha_transaccion"]],

  // puja
  ["puja", ["id_lote", "estado_puja"]],
  ["puja", ["id_usuario", "estado_puja"]],
  ["puja", ["id_suscripcion"]],
  ["puja", ["id_proyecto"]],

  // suscripcion_proyecto
  ["suscripcion_proyecto", ["id_usuario", "id_proyecto"]],
  ["suscripcion_proyecto", ["id_proyecto", "activo"]],

  // inversion
  ["inversion", ["id_usuario"]],
  ["inversion", ["id_proyecto", "estado"]],
  ["inversion", ["id_suscripcion"]],

  // resumenes_cuentas
  ["resumenes_cuentas", ["id_suscripcion"]],

  // imagen
  ["imagen", ["id_proyecto"]],
  ["imagen", ["id_lote"]],

  // mensaje
  ["mensaje", ["id_receptor", "leido"]],
  ["mensaje", ["id_remitente"]],

  // lote
  ["lote", ["id_proyecto"]],
  ["lote", ["estado_subasta"]],
  ["lote", ["id_ganador"]],

  // favorito (ya existe (id_usuario, id_lote); falta el sentido inverso)
  ["favorito", ["id_lote"]],

  // pago_adhesion
  ["pago_adhesion", ["id_adhesion", "estado"]],
  ["pago_adhesion", ["estado", "fecha_vencimiento"]],

  // pagos_mercado
  ["pagos_mercado", ["id_transaccion"]],

  // cuota_mensual
  ["cuota_mensual", ["id_proyecto"]],

  // usuario: búsquedas por token (confirmación / reset). Parciales = diminutos.
  ["usuario", ["confirmacion_token"], { where: '"confirmacion_token" IS NOT NULL' }],
  ["usuario", ["reset_password_token"], { where: '"reset_password_token" IS NOT NULL' }],
];

const q = (id) => `"${String(id).replace(/"/g, '""')}"`;
const indexName = (table, cols) => `idx_${table}_${cols.join("_")}`.slice(0, 63);

async function columnsOf(sequelize, table) {
  const [rows] = await sequelize.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = :table`,
    { replacements: { table } },
  );
  return new Set(rows.map((r) => r.column_name));
}

async function applyIndexes(sequelize, { dryRun = false, log = console.log } = {}) {
  let created = 0;
  let skipped = 0;
  const touched = new Set();
  const [existingIdx] = await sequelize.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()",
  );
  const already = new Set(existingIdx.map((r) => r.indexname));

  for (const [table, cols, opts = {}] of INDEXES) {
    const existing = await columnsOf(sequelize, table);
    if (existing.size === 0) {
      log(`⏭️  ${table}: la tabla no existe, se omite.`);
      skipped++;
      continue;
    }
    const missing = cols.filter((c) => !existing.has(c));
    if (missing.length) {
      log(`⏭️  ${table}(${cols.join(", ")}): falta la columna ${missing.join(", ")}, se omite.`);
      skipped++;
      continue;
    }

    const name = indexName(table, cols);
    if (already.has(name)) {
      log(`⏩ ${name} ya existe.`);
      continue;
    }
    const sql =
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${q(name)} ON ${q(table)} (${cols
        .map(q)
        .join(", ")})` + (opts.where ? ` WHERE ${opts.where}` : "");

    if (dryRun) {
      log(`[dry-run] ${sql}`);
      continue;
    }
    const t0 = Date.now();
    try {
      await sequelize.query(sql, { raw: true });
      created++;
      touched.add(table);
      log(`✅ ${name} (${Date.now() - t0} ms)`);
    } catch (err) {
      // Un CONCURRENTLY interrumpido deja un índice INVALID: se elimina para reintentar.
      log(`❌ ${name}: ${err.message}`);
      await sequelize
        .query(`DROP INDEX CONCURRENTLY IF EXISTS ${q(name)}`, { raw: true })
        .catch(() => {});
    }
  }

  if (!dryRun) {
    for (const table of touched) {
      await sequelize.query(`ANALYZE ${q(table)}`, { raw: true }).catch(() => {});
    }
  }
  log(`\nÍndices procesados: ${INDEXES.length} | ejecutados: ${created} | omitidos: ${skipped}`);
  return { created, skipped };
}

/**
 * Sequelize `sync({ alter: true })` agrega un UNIQUE nuevo en CADA arranque cuando una columna
 * está declarada con `unique: true`. Quedan N constraints idénticos (pagos_mercado, verificacion_identidad)
 * y cada uno es un índice más que Postgres mantiene en cada INSERT/UPDATE.
 * Esta rutina conserva el primero y elimina el resto.
 */
async function dedupeUniqueConstraints(sequelize, { dryRun = false, log = console.log } = {}) {
  const [dups] = await sequelize.query(`
    SELECT c.conrelid::regclass::text AS tabla,
           array_agg(c.conname::text ORDER BY c.oid) AS nombres,
           (SELECT string_agg(a.attname, ',' ORDER BY a.attnum)
              FROM pg_attribute a
             WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) AS columnas
      FROM pg_constraint c
     WHERE c.contype = 'u' AND c.connamespace = current_schema()::regnamespace
     GROUP BY c.conrelid, c.conkey
    HAVING count(*) > 1`);

  let dropped = 0;
  for (const d of dups) {
    const canonical = canonicalName(d.tabla, d.columnas);
    // Se conserva el constraint con nombre canónico si existe; si no, el más antiguo.
    const keep = d.nombres.includes(canonical) ? canonical : d.nombres[0];
    const extra = d.nombres.filter((n) => n !== keep);
    log(`🧹 ${d.tabla}(${d.columnas}): conservo "${keep}", elimino ${extra.length} duplicado(s).`);
    for (const name of extra) {
      const sql = `ALTER TABLE ${d.tabla} DROP CONSTRAINT IF EXISTS ${q(name)}`;
      if (dryRun) {
        log(`[dry-run] ${sql}`);
        continue;
      }
      try {
        await sequelize.query(sql, { raw: true });
        dropped++;
      } catch (err) {
        log(`   ⚠️  No se pudo eliminar ${name}: ${err.message}`);
      }
    }
  }
  if (!dups.length) log("🧹 No hay constraints UNIQUE duplicados.");
  await canonicalizeUniques(sequelize, { dryRun, log });
  return { dropped };
}

// Los modelos pagoMercado y verificacion_identidad declaran su UNIQUE como índice con este nombre fijo.
// Si el constraint sobreviviente tiene otro nombre (p. ej. ..._key5), `sync({ alter: true })` no lo reconoce
// y crearía un índice único ADICIONAL. Por eso se renombra al nombre canónico.
const CANONICAL_UNIQUES = [
  ["pagos_mercado", "id_transaccion_pasarela"],
  ["verificacion_identidad", "id_usuario"],
];
const canonicalName = (tabla, columnas) => `${tabla}_${String(columnas).split(",").join("_")}_key`;

async function canonicalizeUniques(sequelize, { dryRun = false, log = console.log } = {}) {
  for (const [tabla, columna] of CANONICAL_UNIQUES) {
    const canonical = canonicalName(tabla, columna);
    const [cons] = await sequelize.query(
      `SELECT c.conname::text AS conname, c.conindid::regclass::text AS idx
         FROM pg_constraint c
        WHERE c.contype = 'u' AND c.conrelid = :tabla::regclass
          AND (SELECT array_agg(a.attname::text) FROM pg_attribute a
                WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) = ARRAY[:columna]::text[]`,
      { replacements: { tabla, columna } },
    ).catch(() => [[]]);
    if (!cons.length) continue; // la tabla no tiene ese constraint: nada que unificar

    // Índices únicos "sueltos" (no respaldan ningún constraint) sobre la misma columna = redundantes.
    const [sueltos] = await sequelize.query(
      `SELECT i.indexrelid::regclass::text AS idx
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
        WHERE i.indrelid = :tabla::regclass AND i.indisunique AND NOT i.indisprimary
          AND i.indnatts = 1 AND a.attname = :columna
          AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)`,
      { replacements: { tabla, columna } },
    );
    for (const { idx } of sueltos) {
      const sql = `DROP INDEX CONCURRENTLY IF EXISTS ${q(idx.replace(/^"|"$/g, ""))}`;
      log(`🧹 ${tabla}(${columna}): índice único redundante "${idx}" → se elimina.`);
      if (!dryRun) await sequelize.query(sql, { raw: true }).catch((e) => log(`   ⚠️  ${e.message}`));
    }

    const keep = cons.find((c) => c.conname === canonical) || cons[0];
    if (keep.conname !== canonical) {
      const sql = `ALTER TABLE ${q(tabla)} RENAME CONSTRAINT ${q(keep.conname)} TO ${q(canonical)}`;
      log(`🏷️  ${tabla}(${columna}): renombro "${keep.conname}" → "${canonical}".`);
      if (!dryRun) await sequelize.query(sql, { raw: true }).catch((e) => log(`   ⚠️  ${e.message}`));
    }
  }
}

module.exports = { INDEXES, applyIndexes, dedupeUniqueConstraints, canonicalizeUniques };

// Ejecución directa por CLI
if (require.main === module) {
  const { sequelize } = require("../config/database");
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  (async () => {
    try {
      await sequelize.authenticate();
      if (args.has("--dedupe")) await dedupeUniqueConstraints(sequelize, { dryRun });
      await applyIndexes(sequelize, { dryRun });
    } catch (err) {
      console.error("Error:", err.message);
      process.exitCode = 1;
    } finally {
      await sequelize.close();
    }
  })();
}
