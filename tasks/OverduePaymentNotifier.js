// Archivo: overduePaymentNotifier.js

// Librerías de terceros
const cron = require("node-cron");

// Servicios de la aplicación
const PagoService = require("../services/pago.service");
const MensajeService = require("../services/mensaje.service");
const emailService = require("../services/email.service");
const Usuario = require("../models/usuario");
const usuarioService = require("../services/usuario.service");

/**
 * Módulo para gestionar la notificación periódica de pagos vencidos.
 */
const overduePaymentNotifier = {
  job: cron.schedule(
    // 🎯 CRON MODIFICADO: 7:50 AM, cada 5 días del mes.
    "50 07 */5 * *",
    async () => {
      console.log(
        "--- Iniciando el envío de notificaciones de pagos vencidos ---"
      );
      try {
        const pagosVencidos = await PagoService.findOverduePayments();
        const remitente_id = 1;

        for (const pago of pagosVencidos) {
          if (
            pago.suscripcion &&
            pago.suscripcion.proyectoAsociado &&
            pago.suscripcion.usuario
          ) {
            // 1. OBTENER MONTOS
            const montoBase = parseFloat(
              pago.suscripcion.proyectoAsociado.monto_inversion
            );
            const montoActual = pago.monto;
            const recargoTotal = montoActual - montoBase;
            const recargoTotalTexto =
              recargoTotal > 0 ? ` (Aumento: $${recargoTotal.toFixed(2)})` : "";

            const usuario = pago.suscripcion.usuario; // Obtenemos la referencia al usuario
            // 2. CONTENIDO DEL MENSAJE INTERNO AL USUARIO
            const contenido = `ALERTA DE PAGO VENCIDO: Tu cuota del **Mes ${
              pago.mes
            }** para el proyecto "${
              pago.suscripcion.proyectoAsociado.nombre_proyecto
            }" ha vencido. El monto original era de $${montoBase.toFixed(
              2
            )}. **El nuevo monto a pagar es de $${montoActual.toFixed(
              2
            )}${recargoTotalTexto}**. Por favor, realiza el pago inmediatamente para evitar mayores recargos.`;

            // 3. Envía un mensaje interno al usuario.
            await MensajeService.crear({
              id_remitente: remitente_id,
              id_receptor: pago.suscripcion.id_usuario,
              contenido: contenido,
            });

            // 4. Envía correo de ALERTA al cliente (suscriptor).
            if (usuario && usuario.email) {
              await emailService.notificarPagoVencidoUsuario(
                usuario,
                pago.suscripcion.proyectoAsociado,
                pago,
                montoBase,
                recargoTotal
              );
            } else {
              console.warn(`[!] Cliente sin email: Pago ID ${pago.id}`);
            }

            // 5. Envía correo de ALERTA a todos los administradores (empresa) para seguimiento.
            try {
              const administradores = await usuarioService.findAllAdmins();

              for (const admin of administradores) {
                if (admin.email) {
                  // Validamos que el administrador tenga email
                  await emailService.notificarPagoVencidoAdmin(
                    admin.email,
                    usuario, // Pasa el objeto usuario
                    pago.suscripcion.proyectoAsociado,
                    pago,
                    montoBase,
                    recargoTotal
                  );
                } else {
                  console.warn(`[!] Administrador sin email: ID ${admin.id}`);
                }
              }
            } catch (errorAdmin) {
              console.error(
                "Error al obtener o notificar a administradores sobre pago vencido:",
                errorAdmin.message
              );
            }

            console.log(
              `Notificación de pago vencido enviada para pago ID: ${pago.id}`
            );
          }
        }
        console.log(
          "--- Envío de notificaciones de pagos vencidos completado. ---"
        );
      } catch (error) {
        console.error(
          "Error al enviar notificaciones de pagos vencidos:",
          error
        );
      }
    },
    {
      scheduled: false,
    }
  ),

  start() {
    this.job.start();
    // 🟢 MENSAJE CORREGIDO PARA MOSTRAR LA NUEVA FRECUENCIA
    console.log(
      "Cron job de notificaciones de pagos vencidos programado para ejecutarse a las 7:50 AM los días 1, 6, 11, 16, 21, 26 y 31 de cada mes. 🔔"
    );
  },
};

module.exports = overduePaymentNotifier;
