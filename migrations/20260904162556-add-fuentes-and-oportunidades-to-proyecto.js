"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Agregar columna 'fuentes_abastecimiento' (ARRAY de strings)
    await queryInterface.addColumn("proyecto", "fuentes_abastecimiento", {
      type: Sequelize.ARRAY(Sequelize.STRING),
      allowNull: true,
      defaultValue: null,
    });

    // Agregar columna 'oportunidades_identificadas' (INTEGER)
    await queryInterface.addColumn("proyecto", "oportunidades_identificadas", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    // Revertir los cambios
    await queryInterface.removeColumn("proyecto", "fuentes_abastecimiento");
    await queryInterface.removeColumn(
      "proyecto",
      "oportunidades_identificadas",
    );
  },
};
