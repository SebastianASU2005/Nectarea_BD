"use strict";

/**
 * Agrega 'fuentes_abastecimiento' (ARRAY de STRING) y 'oportunidades_identificadas' (INTEGER)
 * a la tabla proyecto.
 *
 * IMPORTANTE: es idempotente porque `Proyecto.sync({ alter: true })` de app.js
 * puede haber creado ya estas columnas al arrancar el backend. Solo agrega lo que falta.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable("proyecto");

    if (!desc.fuentes_abastecimiento) {
      await queryInterface.addColumn("proyecto", "fuentes_abastecimiento", {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: null,
      });
    } else {
      console.log("⏭️  proyecto.fuentes_abastecimiento ya existe, saltando.");
    }

    if (!desc.oportunidades_identificadas) {
      await queryInterface.addColumn(
        "proyecto",
        "oportunidades_identificadas",
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: null,
        },
      );
    } else {
      console.log(
        "⏭️  proyecto.oportunidades_identificadas ya existe, saltando.",
      );
    }
  },

  async down(queryInterface) {
    const desc = await queryInterface.describeTable("proyecto");

    if (desc.fuentes_abastecimiento) {
      await queryInterface.removeColumn("proyecto", "fuentes_abastecimiento");
    }
    if (desc.oportunidades_identificadas) {
      await queryInterface.removeColumn(
        "proyecto",
        "oportunidades_identificadas",
      );
    }
  },
};
