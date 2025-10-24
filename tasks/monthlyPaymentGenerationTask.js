// Librerías
const cron = require("node-cron");
const { sequelize } = require("../config/database");
const { Op } = require("sequelize");
const Proyecto = require("../models/proyecto");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Usuario = require("../models/usuario");
const emailService = require("../services/email.service"); // Importado
const pagoService = require("../services/pago.service");

/**
 * 🎯 LÓGICA CENTRAL DE LA TAREA: Genera los pagos mensuales para suscripciones activas.
 * Llama a generarPagoMensualConDescuento para aplicar saldos a favor.
 * @async
 */
const generatePaymentsCore = async () => {
  console.log(
    "Iniciando el proceso de generación de pagos mensuales con descuento..."
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
      // 2. Encontrar todas las suscripciones activas para el proyecto
      const suscripciones = await SuscripcionProyecto.findAll({
        where: { id_proyecto: proyecto.id, activo: true },
        transaction: t,
      });

      if (suscripciones.length > 0) {
        for (const suscripcion of suscripciones) {
          // 3. LÓGICA CLAVE: Generar el pago
          const resultadoPago =
            await pagoService.generarPagoMensualConDescuento(suscripcion.id, {
              transaction: t,
            });

          // 4. Procesar el resultado
          if (resultadoPago && resultadoPago.id) {
            console.log(
              `Pago ${resultadoPago.mes} creado/descontado para suscripción ${suscripcion.id}. Estado: ${resultadoPago.estado_pago}. Monto Pendiente: ${resultadoPago.monto}.`
            );

            // 5. Enviar notificación al usuario
            // ⚠️ Se asume que Usuario.findByPk no requiere la transacción para el email.
            const usuario = await Usuario.findByPk(suscripcion.id_usuario);

            // 🟢 CAMBIO: Llamada a la función específica del email service
            if (usuario && usuario.email) {
              const fechaVencimientoDate = new Date(
                resultadoPago.fecha_vencimiento
              );
              const fechaVencimientoString = fechaVencimientoDate
                .toISOString()
                .split("T")[0];

              await emailService.notificarPagoGenerado(
                // ⬅️ FUNCIÓN ESPECÍFICA
                usuario, // Se pasa el objeto usuario completo
                proyecto,
                resultadoPago.mes,
                parseFloat(resultadoPago.monto),
                fechaVencimientoString
              );
            }
            // 🟢 FIN CAMBIO
          } else if (resultadoPago && resultadoPago.message) {
            console.log(
              `Suscripción ${suscripcion.id}: ${resultadoPago.message}`
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
  // 🗓️ CRON MODIFICADO para ejecutarse el DÍA 1 de cada mes a las 13:24
  job: cron.schedule(
    "24 13 1 * *", // MINUTO 24, HORA 13 (1:24 PM), DÍA 1
    generatePaymentsCore,
    {
      scheduled: false,
    }
  ),

  start() {
    this.job.start();
    console.log(
      "Cron job de generación de pagos mensuales programado para ejecutarse a la 1:24 PM (hora de tu servidor) el DÍA 1 de cada mes. 🗓️"
    );
  },

  async runManual() {
    console.log("--- EJECUCIÓN MANUAL DE TAREA DE PAGOS INICIADA ---");
    return generatePaymentsCore();
  },
};

module.exports = monthlyPaymentGenerationTask;
