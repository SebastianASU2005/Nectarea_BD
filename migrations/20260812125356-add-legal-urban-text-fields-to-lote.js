"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("lote", "situacion_juridica", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn("lote", "estado_urbanistico", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("lote", "situacion_juridica");
    await queryInterface.removeColumn("lote", "estado_urbanistico");
  },
};
