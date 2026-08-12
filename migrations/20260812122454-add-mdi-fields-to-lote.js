"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Crear los tipos ENUM (si no existen)
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_lote_fuente_abastecimiento" AS ENUM ('propia', 'corredor');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_lote_estado_actual" AS ENUM ('incorporado', 'pendiente_negociacion');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 2. Agregar columna 'fuente_abastecimiento' usando el tipo creado
    await queryInterface.addColumn("lote", "fuente_abastecimiento", {
      type: "enum_lote_fuente_abastecimiento",
      allowNull: true,
      defaultValue: "propia",
    });

    // 3. Agregar columna 'estado_actual' usando el tipo creado
    await queryInterface.addColumn("lote", "estado_actual", {
      type: "enum_lote_estado_actual",
      allowNull: true,
      defaultValue: "pendiente_negociacion",
    });

    // 4. Agregar columna 'fuente_nombre' (STRING normal)
    await queryInterface.addColumn("lote", "fuente_nombre", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Eliminar columnas
    await queryInterface.removeColumn("lote", "fuente_abastecimiento");
    await queryInterface.removeColumn("lote", "estado_actual");
    await queryInterface.removeColumn("lote", "fuente_nombre");

    // Eliminar los tipos ENUM (opcional, pero recomendado para limpieza)
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_lote_fuente_abastecimiento";',
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_lote_estado_actual";',
    );
  },
};
