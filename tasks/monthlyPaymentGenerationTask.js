// Librerías
const cron = require("node-cron");
const { sequelize } = require("../config/database");
const { Op } = require("sequelize");
const Proyecto = require("../models/proyecto");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Usuario = require("../models/usuario");
const emailService = require("../services/email.service");
const pagoService = require("../services/pago.service");

/**
 * 🎯 LÓGICA CENTRAL DE LA TAREA: Genera los pagos mensuales para suscripciones activas.
 * Solo considera suscripciones con adhesion_completada = true.
 * Llama a generarPagoMensualConDescuento para aplicar saldos a favor.
 */
const generatePaymentsCore = async () => {
  console.log(
    "Iniciando el proceso de generación de pagos mensuales con descuento...",
  );
  const t = await sequelize.transaction();
  // ⚡ Notificaciones pendientes: se envían DESPUÉS del COMMIT (ver más abajo).
  const notificaciones = [];

  try {
    // 1. Encontrar proyectos activos que requieren pagos mensuales
    const proyectosActivos = await Proyecto.findAll({
      where: {
        activo: true,
        estado_proyecto: "En proceso",
        tipo_inversion: "mensual",
      },
      transaction: t,
    });

    for (const proyecto of proyectosActivos) {
      // 🔥 FILTRO: Solo suscripciones activas Y con adhesión completada
      const suscripciones = await SuscripcionProyecto.findAll({
        where: {
          id_proyecto: proyecto.id,
          activo: true,
          adhesion_completada: true, // 👈 CRÍTICO: omitir quienes no completaron adhesión
        },
        transaction: t,
      });

      if (suscripciones.length > 0) {
        for (const suscripcion of suscripciones) {
          // Generar el pago (el método ya valida meses restantes y adhesion_completada internamente)
          const resultadoPago =
            await pagoService.generarPagoMensualConDescuento(suscripcion.id, {
              transaction: t,
            });

          if (resultadoPago && resultadoPago.id) {
            console.log(
              `Pago ${resultadoPago.mes} creado/descontado para suscripción ${suscripcion.id}. Estado: ${resultadoPago.estado_pago}. Monto Pendiente: ${resultadoPago.monto}.`,
            );

            // ⚡ Antes: por cada suscripción se hacía un SELECT de usuario (fuera de la transacción =
            // 2ª conexión del pool) y se ESPERABA al SMTP dentro de la transacción, que quedaba abierta
            // (con locks) tanto como tardaran N correos (horas con miles de suscripciones). Además, si algo
            // fallaba al final, el rollback deshacía los pagos pero los correos ya habían salido.
            // Ahora solo se encola; el envío ocurre tras el COMMIT.
            notificaciones.push({
              id_usuario: suscripcion.id_usuario,
              proyecto,
              mes: resultadoPago.mes,
              monto: parseFloat(resultadoPago.monto),
              fecha_vencimiento: resultadoPago.fecha_vencimiento,
            });
          } else if (resultadoPago && resultadoPago.message) {
            console.log(
              `Suscripción ${suscripcion.id}: ${resultadoPago.message}`,
            );
          }
        }
      }
    }

    await t.commit();
    console.log("Proceso de generación de pagos completado.");
  } catch (error) {
    await t.rollback();
    console.error("Error en el cron job de pagos:", error);
    return;
  }

  // ⚡ Envío de correos FUERA de la transacción: no retiene conexión ni locks, y un fallo de SMTP
  // ya no puede deshacer los pagos generados.
  await enviarNotificaciones(notificaciones);
};

async function enviarNotificaciones(notificaciones) {
  if (!notificaciones.length) return;
  try {
    // 1 sola consulta para todos los usuarios (antes: 1 por suscripción)
    const ids = [...new Set(notificaciones.map((n) => n.id_usuario))];
    const usuarios = await Usuario.findAll({ where: { id: ids } });
    const porId = new Map(usuarios.map((u) => [u.id, u]));

    for (const n of notificaciones) {
      const usuario = porId.get(n.id_usuario);
      if (!usuario || !usuario.email) continue;
      try {
        const fechaVencimientoString = new Date(n.fecha_vencimiento)
          .toISOString()
          .split("T")[0];
        await emailService.notificarPagoGenerado(
          usuario,
          n.proyecto,
          n.mes,
          n.monto,
          fechaVencimientoString,
        );
      } catch (err) {
        console.error(
          `Error enviando notificación de pago a usuario ${n.id_usuario}:`,
          err.message,
        );
      }
    }
  } catch (err) {
    console.error("Error preparando notificaciones de pagos:", err);
  }
}

// Objeto que contiene el job y los métodos para iniciar/ejecutar
const monthlyPaymentGenerationTask = {
  job: cron.schedule(
    "24 7 1 * *", // Día 1 de cada mes a las 7:24 AM
    generatePaymentsCore,
    { scheduled: false },
  ),

  start() {
    this.job.start();
    console.log(
      "Cron job de generación de pagos mensuales programado para ejecutarse a las 7:24 AM (hora del servidor) el DÍA 1 de cada mes.",
    );
  },

  async runManual() {
    console.log("--- EJECUCIÓN MANUAL DE TAREA DE PAGOS INICIADA ---");
    return generatePaymentsCore();
  },
};

module.exports = monthlyPaymentGenerationTask;
