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

  try {
    // 1. Encontrar proyectos activos que requieren pagos mensuales
    const proyectosActivos = await Proyecto.findAll({
      where: {
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

            const usuario = await Usuario.findByPk(suscripcion.id_usuario);
            if (usuario && usuario.email) {
              const fechaVencimientoDate = new Date(
                resultadoPago.fecha_vencimiento,
              );
              const fechaVencimientoString = fechaVencimientoDate
                .toISOString()
                .split("T")[0];
              await emailService.notificarPagoGenerado(
                usuario,
                proyecto,
                resultadoPago.mes,
                parseFloat(resultadoPago.monto),
                fechaVencimientoString,
              );
            }
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
  }
};

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
