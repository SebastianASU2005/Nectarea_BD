'use strict';

/**
 * Agrega la columna `moneda` (ARS | USD) a inversion, transaccion y pagos_mercado
 * y amplía pagos_mercado.monto_pagado a DECIMAL(15,2).
 *
 * IMPORTANTE – convivencia con `sync({ alter: true })` de app.js:
 * al levantar el server con los modelos nuevos, Sequelize ya crea las columnas
 * (DEFAULT 'ARS'). Por eso esta migración es IDEMPOTENTE (solo agrega lo que
 * falta) y su valor real es el BACKFILL de datos históricos.
 *
 * Criterio de backfill: `moneda` representa la moneda EN LA QUE SE COBRÓ.
 *  - Todo lo histórico pasó por Mercado Pago con MP_CURRENCY_ID (ARS), aunque
 *    el proyecto "directo" figurara como USD. Por eso transaccion y
 *    pagos_mercado quedan en la moneda histórica (default) y NO se reetiquetan
 *    desde proyecto.moneda: eso falsearía pagos ya cobrados en ARS como USD.
 *  - Inversiones sin dinero movido (pendiente / fallido) toman la moneda del
 *    proyecto, porque se cobrarán bajo las reglas nuevas.
 */

const MONEDA_HISTORICA = (process.env.MP_CURRENCY_ID || 'ARS').toUpperCase();

async function addMonedaIfMissing(queryInterface, Sequelize, table) {
  const desc = await queryInterface.describeTable(table);
  if (!desc.moneda) {
    await queryInterface.addColumn(table, 'moneda', {
      type: Sequelize.STRING(3),
      allowNull: false,
      defaultValue: MONEDA_HISTORICA,
    });
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of ['inversion', 'transaccion', 'pagos_mercado']) {
        await addMonedaIfMissing(queryInterface, Sequelize, table);
      }

      await queryInterface.changeColumn(
        'pagos_mercado',
        'monto_pagado',
        { type: Sequelize.DECIMAL(15, 2), allowNull: false },
        { transaction },
      );

      // Inversiones sin dinero movido → moneda del proyecto (solo ARS/USD válidos).
      await queryInterface.sequelize.query(
        `UPDATE inversion i
            SET moneda = CASE WHEN p.moneda IN ('ARS','USD') THEN p.moneda ELSE 'ARS' END
           FROM proyecto p
          WHERE i.id_proyecto = p.id
            AND i.estado IN ('pendiente','fallido')`,
        { transaction },
      );

      // Inversiones pagadas/reembolsadas y todo lo demás: se conserva la moneda
      // histórica realmente cobrada (default de la columna).
    });
  },

  async down(queryInterface) {
    // No se reduce monto_pagado a (10,2): podría truncar/fallar con datos grandes.
    for (const table of ['pagos_mercado', 'transaccion', 'inversion']) {
      const desc = await queryInterface.describeTable(table);
      if (desc.moneda) await queryInterface.removeColumn(table, 'moneda');
    }
  },
};
