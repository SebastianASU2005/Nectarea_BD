// Archivo: overduePaymentNotifier.js

// Librerías de terceros
const cron = require("node-cron");

// Servicios de la aplicación
const PagoService = require("../services/pago.service");
const MensajeService = require("../services/mensaje.service");
const emailService = require("../services/email.service"); // Importado
// 🟢 CAMBIO 1: Importar el modelo o servicio de usuarios para buscar a los administradores
const Usuario = require("../models/usuario");

// Configuración de la aplicación
// Se mantiene la importación, aunque ya no se usa directamente en el envío al admin, sino para referencia.
const { email_empresa } = require("../config/config");
const usuarioService = require("../services/usuario.service");

/**
 * Módulo para gestionar la notificación periódica de pagos vencidos.
 */
const overduePaymentNotifier = {
  job: cron.schedule(
    // CRON ACTUAL: 9:20 AM. Mantenido así para recordatorios DIARIOS.
    // Si quiere que sea semanal, cambie a: "20 09 * * 1" (Lunes 9:20 AM)
    "50 09 * * *",
    async () => {
      console.log(
        "--- Iniciando el envío de notificaciones de pagos vencidos ---"
      );
      try {
        const pagosVencidos = await PagoService.findOverduePayments();
        const remitente_id = 1; // --- LÓGICA DE NOTIFICACIÓN SEMANAL (Descomentar si es necesario) --- // const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        for (const pago of pagosVencidos) {
          // // --- FILTRO SEMANAL (Descomentar si es necesario) ---
          // const ultimaNotificacion = pago.fecha_ultima_notificacion ? new Date(pago.fecha_ultima_notificacion) : null;
          // if (ultimaNotificacion && ultimaNotificacion > sevenDaysAgo) {
          //     console.log(`Pago ${pago.id} notificado recientemente. Saltando...`);
          //     continue;
          // }

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

            const usuario = pago.suscripcion.usuario; // Obtenemos la referencia al usuario // 2. CONTENIDO DEL MENSAJE INTERNO AL USUARIO

            const contenido = `ALERTA DE PAGO VENCIDO: Tu cuota del **Mes ${
              pago.mes
            }** para el proyecto "${
              pago.suscripcion.proyectoAsociado.nombre_proyecto
            }" ha vencido. El monto original era de $${montoBase.toFixed(
              2
            )}. **El nuevo monto a pagar es de $${montoActual.toFixed(
              2
            )}${recargoTotalTexto}**. Por favor, realiza el pago inmediatamente para evitar mayores recargos.`; // 3. Envía un mensaje interno al usuario.

            await MensajeService.crear({
              id_remitente: remitente_id,
              id_receptor: pago.suscripcion.id_usuario,
              contenido: contenido,
            }); // 🟢 CAMBIO 2: Validar el email del cliente (suscriptor) antes de enviar. // 4. Envía correo de ALERTA al cliente (suscriptor).

            if (usuario && usuario.email) {
              await emailService.notificarPagoVencidoCliente(
                usuario,
                pago.suscripcion.proyectoAsociado,
                pago,
                montoBase,
                recargoTotal
              );
            } else {
              console.warn(`[!] Cliente sin email: Pago ID ${pago.id}`);
            } // 🟢 CAMBIO 3: Itera sobre todos los administradores. // 5. Envía correo de ALERTA a todos los administradores (empresa) para seguimiento.

            try {
              // Asumiendo que Usuario.findAllAdmins() trae todos los usuarios con rol de administrador
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
            } // // 6. Actualiza la fecha de última notificación (Descomentar si es necesario para el modo semanal) // // await PagoService.updateLastNotificationDate(pago.id);
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
    console.log(
      "Cron job de notificaciones de pagos vencidos programado para ejecutarse a las 9:20 AM (hora de tu servidor)."
    );
  },
};

module.exports = overduePaymentNotifier;
