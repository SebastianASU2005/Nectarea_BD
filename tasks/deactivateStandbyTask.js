const cron = require("node-cron");
const { sequelize, Op } = require("../config/database");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");
const Usuario = require("../models/usuario");
const emailService = require("../services/email.service");
const mensajeService = require("../services/mensaje.service");

const deactivateExpiredStandby = async () => {
  const t = await sequelize.transaction();
  try {
    const hoy = new Date();
    const año = hoy.getFullYear();
    const mes = hoy.getMonth(); // 0-11

    // Primer día del mes actual (ej. 2025-07-01)
    const primerDiaMesActual = new Date(año, mes, 1);
    // Último día del mes actual (ej. 2025-07-31)
    const ultimoDiaMesActual = new Date(año, mes + 1, 0);
    ultimoDiaMesActual.setHours(23, 59, 59, 999);

    const suscripciones = await SuscripcionProyecto.findAll({
      where: {
        standby_active: true,
        standby_end_date: {
          [Op.between]: [primerDiaMesActual, ultimoDiaMesActual],
        },
        activo: true,
      },
      transaction: t,
      include: [
        { model: Proyecto, as: "proyectoAsociado" },
        { model: Usuario, as: "usuario" },
      ],
    });

    console.log(
      `[CRON] Se encontraron ${suscripciones.length} suscripciones con standby finalizando en este mes.`,
    );

    for (const suscripcion of suscripciones) {
      await suscripcion.update(
        {
          standby_active: false,
          standby_end_date: null,
        },
        { transaction: t },
      );

      const usuario = suscripcion.usuario;
      const proyecto = suscripcion.proyectoAsociado;
      if (usuario && usuario.email) {
        await emailService.notificarStandbyFinalizado(usuario, proyecto);
      }
      await mensajeService.crear({
        id_remitente: 1,
        id_receptor: usuario.id,
        contenido: `✅ Tu período de pausa de 6 meses para el proyecto "${proyecto.nombre_proyecto}" finaliza este mes. A partir del próximo mes (${new Date(año, mes + 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}), se reanudará la generación de tus cuotas mensuales.`,
      });
    }

    await t.commit();
    console.log(
      `[CRON] ${suscripciones.length} suscripciones salieron del modo standby.`,
    );
  } catch (error) {
    await t.rollback();
    console.error("❌ Error en deactivateStandbyTask:", error);
  }
};

const startStandbyDeactivator = () => {
  // Se ejecuta el día 5 de cada mes a las 2:00 AM
  cron.schedule("0 2 5 * *", deactivateExpiredStandby);
  console.log(
    "✅ CRON: Reactivación automática de standby programada para el día 5 de cada mes a las 2:00 AM.",
  );
};

module.exports = { startStandbyDeactivator, deactivateExpiredStandby };
