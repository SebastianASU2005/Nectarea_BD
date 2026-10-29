// scripts/fixEnums.js
require("dotenv").config();
const { sequelize } = require("../config/database");

(async () => {
  try {
    console.log("🔧 Arreglando ENUMs de lote...\n");

    // Postgres no permite ALTER TYPE ... ADD VALUE dentro de una transacción,
    // así que lo corremos directo sin transaction.
    await sequelize.query(
      `ALTER TYPE enum_lote_estado_actual ADD VALUE IF NOT EXISTS 'negociacion_avanzada';`,
    );
    console.log("✅ 'negociacion_avanzada' agregado a enum_lote_estado_actual");

    // Verificar
    const [enums] = await sequelize.query(`
      SELECT t.typname AS enum_name,
             array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname IN ('enum_lote_estado_actual', 'enum_lote_fuente_abastecimiento')
       GROUP BY t.typname;
    `);

    console.log("\n📋 Estado final de los ENUMs:");
    console.table(enums);

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
})();