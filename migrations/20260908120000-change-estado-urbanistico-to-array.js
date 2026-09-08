'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Paso 1: Agregar columna temporal de tipo ARRAY
    await queryInterface.addColumn('lote', 'estado_urbanistico_temp', {
      type: Sequelize.ARRAY(Sequelize.STRING),
      allowNull: true,
    });

    // Paso 2: Migrar datos existentes (convertir string a array de un elemento)
    await queryInterface.sequelize.query(`
      UPDATE lote
      SET estado_urbanistico_temp = 
        CASE 
          WHEN estado_urbanistico IS NOT NULL THEN ARRAY[estado_urbanistico]
          ELSE NULL
        END;
    `);

    // Paso 3: Eliminar la columna antigua (string)
    await queryInterface.removeColumn('lote', 'estado_urbanistico');

    // Paso 4: Renombrar la nueva columna al nombre original
    await queryInterface.renameColumn('lote', 'estado_urbanistico_temp', 'estado_urbanistico');
  },

  async down(queryInterface, Sequelize) {
    // Revertir: volver a STRING
    // Paso 1: Agregar columna temporal string
    await queryInterface.addColumn('lote', 'estado_urbanistico_old', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    // Paso 2: Convertir array a string (tomar el primer elemento, o unir con coma, según tu caso)
    await queryInterface.sequelize.query(`
      UPDATE lote
      SET estado_urbanistico_old = 
        CASE 
          WHEN estado_urbanistico IS NOT NULL AND array_length(estado_urbanistico, 1) > 0 
          THEN estado_urbanistico[1]
          ELSE NULL
        END;
    `);

    // Paso 3: Eliminar la columna array
    await queryInterface.removeColumn('lote', 'estado_urbanistico');

    // Paso 4: Renombrar la temporal al original
    await queryInterface.renameColumn('lote', 'estado_urbanistico_old', 'estado_urbanistico');
  }
};