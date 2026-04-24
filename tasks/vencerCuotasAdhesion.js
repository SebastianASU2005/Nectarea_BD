// tasks/vencerCuotasAdhesion.js (versión corregida)
const { sequelize, Op } = require("../config/database");
const PagoAdhesion = require("../models/pagoAdhesion");
const Adhesion = require("../models/adhesion");
const Proyecto = require("../models/proyecto"); // ✅ Importar Proyecto
const emailService = require("../services/email.service");
const usuarioService = require("../services/usuario.service");

const DAILY_INTEREST_RATE = 0.04265 / 30; // 4.265% mensual dividido 30 días

async function marcarCuotasAdhesionVencidas() {
  const t = await sequelize.transaction();
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const cuotasVencer = await PagoAdhesion.findAll({
      where: {
        estado: "pendiente",
        fecha_vencimiento: { [Op.lt]: hoy },
      },
      include: [
        {
          model: Adhesion,
          as: "adhesion",
          include: [
            {
              model: Proyecto,
              as: "proyecto",
              attributes: ["id", "nombre_proyecto"], // solo lo necesario
            },
          ],
        },
      ],
      transaction: t,
    });

    if (cuotasVencer.length === 0) {
      await t.commit();
      return 0;
    }

    let actualizadas = 0;
    for (const cuota of cuotasVencer) {
      const adhesion = cuota.adhesion;
      const fechaVenc = new Date(cuota.fecha_vencimiento);
      const diasVencidos = Math.floor(
        (hoy - fechaVenc) / (1000 * 60 * 60 * 24),
      );
      let nuevoMonto = parseFloat(cuota.monto);
      let recargo = 0;

      if (diasVencidos > 0) {
        const factor = Math.pow(1 + DAILY_INTEREST_RATE, diasVencidos);
        nuevoMonto = nuevoMonto * factor;
        recargo = nuevoMonto - cuota.monto;
        await cuota.update(
          {
            estado: "vencido",
            monto: nuevoMonto.toFixed(2),
            motivo: `Recargo automático por ${diasVencidos} días de atraso.`,
          },
          { transaction: t },
        );
      } else {
        await cuota.update({ estado: "vencido" }, { transaction: t });
      }
      actualizadas++;

      // Notificar al usuario (solo si hay email)
      const usuario = await usuarioService.findById(adhesion.id_usuario);
      const proyecto = adhesion.proyecto; // ya viene incluido en la consulta
      if (usuario && usuario.email && proyecto) {
        await emailService.notificarPagoVencidoCliente(
          usuario,
          proyecto, // objeto proyecto completo
          {
            monto: cuota.monto,
            mes: cuota.numero_cuota,
            fecha_vencimiento: cuota.fecha_vencimiento,
          },
          cuota.monto, // monto base (sin recargo)
          recargo, // recargo aplicado
        );
      }
    }

    await t.commit();
    console.log(
      `✅ ${actualizadas} cuotas de adhesión marcadas como vencidas y con interés aplicado.`,
    );
    return actualizadas;
  } catch (error) {
    await t.rollback();
    console.error("❌ Error en marcarCuotasAdhesionVencidas:", error);
    throw error;
  }
}

module.exports = marcarCuotasAdhesionVencidas;
