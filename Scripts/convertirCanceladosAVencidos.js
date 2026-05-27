// scripts/convertirCanceladosAVencidos.js
// Ejecutar UNA SOLA VEZ: node scripts/convertirCanceladosAVencidos.js

const { sequelize } = require("../config/database");
const Pago = require("../models/pago");

async function convertirCanceladosAVencidos() {
  const t = await sequelize.transaction();
  try {
    // Buscar todos los pagos con estado 'cancelado'
    const pagosCancelados = await Pago.findAll({
      where: { estado_pago: "cancelado" },
      transaction: t,
    });

    if (pagosCancelados.length === 0) {
      console.log("No hay pagos cancelados para convertir.");
      await t.commit();
      return;
    }

    console.log(`Se encontraron ${pagosCancelados.length} pagos cancelados.`);

    // Actualizar cada uno a 'vencido'
    for (const pago of pagosCancelados) {
      await pago.update(
        {
          estado_pago: "vencido",
          // Opcional: resetear updatedAt para que el cron aplique recargo mañana
          updatedAt: new Date(),
        },
        { transaction: t }
      );
      console.log(`✅ Pago ID ${pago.id} (mes ${pago.mes}) convertido a 'vencido'.`);
    }

    await t.commit();
    console.log("Conversión completada.");
  } catch (error) {
    await t.rollback();
    console.error("Error al convertir pagos cancelados:", error);
  } finally {
    process.exit(0);
  }
}

convertirCanceladosAVencidos();