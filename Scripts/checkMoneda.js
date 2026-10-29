// scripts/checkMoneda.js
require("dotenv").config();
const { sequelize } = require("../config/database");

(async () => {
  try {
    console.log("\n📊 MONEDA POR TABLA\n");

    for (const table of ["inversion", "transaccion", "pagos_mercado"]) {
      const [rows] = await sequelize.query(
        `SELECT moneda, COUNT(*) AS total FROM ${table} GROUP BY moneda ORDER BY moneda;`,
      );
      console.log(`── ${table} ──`);
      console.table(rows);
    }

    // ENUMs de lote
    const [enums] = await sequelize.query(`
      SELECT t.typname AS enum_name,
             array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname IN ('enum_lote_estado_actual', 'enum_lote_fuente_abastecimiento')
       GROUP BY t.typname;
    `);
    console.log("\n🔤 ENUMs de LOTE:");
    console.table(enums);

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
})();