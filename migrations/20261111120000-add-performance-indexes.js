"use strict";

// ⚡ PERFORMANCE — índices en FKs/filtros frecuentes + limpieza de UNIQUE duplicados.
// Toda la lógica vive en Scripts/performanceIndexes.js (idempotente, CONCURRENTLY).
// NOTA: CREATE INDEX CONCURRENTLY no puede ejecutarse dentro de una transacción;
// sequelize-cli no abre una por defecto, así que esta migración funciona tal cual.

const { applyIndexes, dedupeUniqueConstraints } = require("../Scripts/performanceIndexes");

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await dedupeUniqueConstraints(sequelize);
    await applyIndexes(sequelize);
  },

  async down(queryInterface) {
    const { INDEXES } = require("../Scripts/performanceIndexes");
    for (const [table, cols] of INDEXES) {
      const name = `idx_${table}_${cols.join("_")}`.slice(0, 63);
      await queryInterface.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
    }
  },
};
