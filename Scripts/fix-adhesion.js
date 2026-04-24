const { sequelize } = require('../config/database');

async function fixAdhesionEnum() {
  try {
    // 1. Verificar si la tabla existe
    const [tableExists] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'adhesion'
      );
    `);
    if (!tableExists[0].exists) {
      console.log('Tabla adhesion no existe. No es necesario corregir.');
      return;
    }

    // 2. Obtener el tipo de la columna 'estado'
    const [columnType] = await sequelize.query(`
      SELECT data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'adhesion' AND column_name = 'estado';
    `);
    const dataType = columnType[0]?.data_type;
    const udtName = columnType[0]?.udt_name;

    if (dataType === 'USER-DEFINED' && udtName && udtName.includes('enum_')) {
      console.log('La columna ya es de tipo ENUM. No se requiere corrección.');
      return;
    }

    console.log('Corrigiendo columna estado a ENUM...');

    // 3. Crear el ENUM si no existe
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."enum_adhesion_estado" AS ENUM('pendiente', 'en_curso', 'completada', 'cancelada');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 4. Agregar columna temporal
    await sequelize.query(`ALTER TABLE adhesion ADD COLUMN estado_new varchar(50);`);
    // Mapear valores existentes (asumiendo que los valores actuales son strings compatibles)
    await sequelize.query(`
      UPDATE adhesion SET estado_new = estado::text;
    `);
    // Eliminar columna antigua y renombrar
    await sequelize.query(`ALTER TABLE adhesion DROP COLUMN estado;`);
    await sequelize.query(`ALTER TABLE adhesion RENAME COLUMN estado_new TO estado;`);
    // Convertir a ENUM
    await sequelize.query(`
      ALTER TABLE adhesion ALTER COLUMN estado TYPE "public"."enum_adhesion_estado" USING estado::"public"."enum_adhesion_estado";
    `);
    await sequelize.query(`ALTER TABLE adhesion ALTER COLUMN estado SET NOT NULL;`);
    await sequelize.query(`ALTER TABLE adhesion ALTER COLUMN estado SET DEFAULT 'pendiente';`);

    console.log('✅ Corrección completada');
  } catch (error) {
    console.error('Error al corregir adhesión:', error);
  } finally {
    await sequelize.close();
  }
}

fixAdhesionEnum();