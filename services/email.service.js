// services/emailService.js
const nodemailer = require("nodemailer");
const { Resend } = require("resend");
const dotenv = require("dotenv");
dotenv.config();

// ✅ CONTROL EXPLÍCITO: Cambia EMAIL_PROVIDER en .env para alternar entre proveedores
// Valores válidos: 'gmail' | 'resend'
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "gmail";

let transporter;
let resend;

if (EMAIL_PROVIDER === "resend" && process.env.RESEND_API_KEY) {
  // 🌐 PRODUCCIÓN: Usar Resend
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log("✅ Configurado email con Resend (Producción)");
} else {
  // 💻 LOCAL / RAILWAY: Usar Gmail con Nodemailer
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // ⚠️ Usar App Password de Google, NO la contraseña normal
    },
  });
  console.log("✅ Configurado email con Gmail/Nodemailer");
}

/**
 * Genera la plantilla base HTML que envuelve el contenido específico del correo.
 * Utiliza tablas para garantizar la compatibilidad con clientes de correo antiguos.
 * @param {string} contenidoPrincipalHtml - El HTML específico del cuerpo del correo.
 * @returns {string} El HTML completo del correo electrónico.
 */
function obtenerPlantillaHtml(contenidoPrincipalHtml) {
  const LOGO_URL =
    "https://res.cloudinary.com/dj7kcgf2z/image/upload/v1762267998/LoteplanLogo_dxbyo5.jpg";
  const FONDO_HEADER_FOOTER = "#0b1b36";

  return `
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f6f6f6;">
        <tr>
          <td align="center">
            <table class="content-table" width="600" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse; max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              
              <!-- ENCABEZADO CON FONDO BLANCO FORZADO -->
              <tr>
                <td align="center" style="padding: 20px 0; background-color: #ffffff !important; border-bottom: 2px solid #eeeeee; color-scheme: light only;">
                  <div style="background-color: #ffffff; padding: 0; mso-line-height-rule: exactly;">
                    <img src="${LOGO_URL}" alt="Logo Loteplan.com" width="200" style="display: block; border: 0; max-width: 200px; height: auto;" />
                  </div>
                </td>
              </tr>
              
              <!-- CONTENIDO PRINCIPAL -->
              <tr>
                <td style="padding: 30px 40px; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333333;">
                  ${contenidoPrincipalHtml}
                </td>
              </tr>
              
              <!-- FOOTER -->
              <tr>
                <td align="center" style="background-color: ${FONDO_HEADER_FOOTER}; padding: 30px 40px 20px;">
                  <p style="margin: 0; color: #ffffff; font-size: 14px; font-family: Arial, sans-serif;">
                    <a href="[URL_SITIO_WEB]" style="color: #ffffff; text-decoration: none;">© ${new Date().getFullYear()} Loteplan.com</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
}

/**
 * Servicio para el envío de correos electrónicos transaccionales.
 */
const emailService = {
  /**
   * Función base para enviar un correo electrónico.
   * Detecta automáticamente si usar Resend (producción) o Gmail/Nodemailer (local/Railway).
   * @param {string} to - Destinatario.
   * @param {string} subject - Asunto.
   * @param {string} text - Cuerpo en texto plano (fallback).
   * @param {string} html - Cuerpo en formato HTML (principal).
   */
  async sendEmail(to, subject, text, html) {
    try {
      if (EMAIL_PROVIDER === "resend" && resend) {
        // 🌐 USAR RESEND (Producción)
        const { data, error } = await resend.emails.send({
          from: "Loteplan <onboarding@resend.dev>",
          to: [to],
          subject: subject,
          html: html,
        });

        if (error) {
          console.error(`❌ Error Resend al enviar a ${to}:`, error);
          throw error;
        }

        console.log(`✅ Email enviado via Resend a ${to} (ID: ${data.id})`);
      } else {
        // 💻 USAR GMAIL/NODEMAILER (Local/Railway)
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to,
          subject,
          text,
          html,
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Email enviado via Gmail/Nodemailer a ${to}`);
      }
    } catch (error) {
      console.error(`❌ Error al enviar correo a ${to}:`, error);
      throw error;
    }
  },

  /**
   * Notifica a los usuarios que una subasta ha iniciado.
   * LÓGICA DE NEGOCIO: Diferencia entre subasta **Pública** y **Privada**.
   * @param {string} email - Correo del destinatario.
   * @param {object} lote - Datos del lote (id, nombre_lote, monto_base_lote, fecha_fin).
   * @param {boolean} esSubastaPrivada - Indica exclusividad.
   */
  async notificarInicioSubasta(email, lote, esSubastaPrivada) {
    const tipoSubasta = esSubastaPrivada ? "Privada" : "Pública";
    const subject = `¡NUEVO LOTE EN SUBASTA (${tipoSubasta})! Lote #${lote.id}`;

    const mensajeExclusividad = esSubastaPrivada
      ? `**IMPORTANTE: Esta es una subasta privada y solo los suscriptores del proyecto asociado pueden participar.**`
      : `¡No te lo pierdas!`;

    const contenidoInterno = `
          <h2 style="color: #0b1b36; margin-top: 0;">¡Subasta Activa! Lote: ${lote.nombre_lote}</h2>
          <p>El lote **"${lote.nombre_lote}"** ya está disponible para pujar en nuestra plataforma.</p>
          <h3 style="color: #333;">Detalles de la Subasta</h3>
          <ul style="list-style: none; padding-left: 0; line-height: 2;">
              <li><strong style="color: #555;">Monto Base:</strong> $${lote.monto_base_lote}</li>
              <li><strong style="color: #FF5733;">Fecha de Cierre Estimada:</strong> ${
                lote.fecha_fin
                  ? lote.fecha_fin.toLocaleDateString("es-ES")
                  : "N/A"
              }</li>
          </ul>
          <p style="font-weight: bold; color: ${esSubastaPrivada ? "red" : "#333"}">${mensajeExclusividad}</p>
          <a href="[URL_A_LA_SUBASTA]" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #0b1b36; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
              Ver Lote Ahora
          </a>
      `;

    const html = obtenerPlantillaHtml(contenidoInterno);
    const text = `Subasta activa: Lote ${lote.nombre_lote}. Monto Base: $${lote.monto_base_lote}. ${esSubastaPrivada ? "Subasta Privada." : "Subasta Pública."}`;

    await this.sendEmail(email, subject, text, html);
  },

  /**
   * Envía el correo electrónico de confirmación de cuenta.
   * @param {object} user - Objeto del usuario (nombre, email).
   * @param {string} token - Token de confirmación.
   */
  async sendConfirmationEmail(user, token) {
    const confirmationLink = `${process.env.FRONTEND_URL}/api/auth/confirmar_email/${token}`;
    const backendConfirmationLink = `${process.env.HOST_URL}/api/auth/confirmar_email/${token}`;
    const subject = "¡Bienvenido! Confirma tu Cuenta de Usuario";

    const contenidoInterno = `
      <h2 style="color: #0b1b36; margin-top: 0;">Hola ${user.nombre},</h2>
      <p>Gracias por registrarte en Loteplan. Por favor, haz clic para confirmar tu correo y activar tu cuenta:</p>
      <a href="${confirmationLink}" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #FF5733; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
          Confirmar mi Correo Electrónico
      </a>
      <p style="margin-top: 30px;">Si no puedes hacer clic en el botón, copia y pega esta URL en tu navegador:</p>
      <small style="word-break: break-all; color: #808080;">${backendConfirmationLink}</small>
    `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      user.email,
      subject,
      `Confirma tu cuenta en ${backendConfirmationLink}`,
      html,
    );
  },

  /**
   * Notifica al usuario que ha ganado un lote.
   * @param {object} user - Ganador.
   * @param {number} loteId - ID del lote ganado.
   * @param {string} fechaLimite - Fecha límite de pago.
   * @param {boolean} [esReasignacion=false] - Indica si la victoria fue por reasignación.
   */
  async notificarGanadorPuja(
    user,
    loteId,
    fechaLimite,
    esReasignacion = false,
  ) {
    const subject = `¡Felicidades! Ganaste el Lote #${loteId}`;

    const titulo = esReasignacion
      ? `Tu puja ha sido la ganadora. El Lote **#${loteId}** te ha sido **reasignado**.`
      : `Tu puja ha sido la ganadora del Lote **#${loteId}**.`;

    const contenidoInterno = `
          <h2 style="color: #4CAF50; margin-top: 0;">¡Felicidades, ${user.nombre}!</h2>
          <p>${titulo}</p>
          ${esReasignacion ? '<p style="color: red; font-weight: bold;">Esto ocurre debido al incumplimiento de pago del postor anterior.</p>' : ""}
          <h3 style="color: #333;">Detalles y Plazo de Pago</h3>
          <p>Tienes **90 días** para completar el pago.</p>
          <p style="font-size: 1.1em; font-weight: bold; color: #FF5733;">La fecha límite de pago es: **${fechaLimite}**.</p>
          <a href="[URL_A_TU_PERFIL_PAGOS]" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
              Gestionar Pago
          </a>
      `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      user.email,
      subject,
      `Ganaste el Lote #${loteId}. Fecha límite de pago: ${fechaLimite}`,
      html,
    );
  },

  /**
   * Notifica al usuario que ha perdido un lote por no cumplir con el plazo de pago.
   * @param {object} user - Usuario incumplidor.
   * @param {number} loteId - ID del lote perdido.
   */
  async notificarImpago(user, loteId) {
    const subject = `Importante: Lote #${loteId} Perdido por Impago`;

    const contenidoInterno = `
          <h2 style="color: #d9534f; margin-top: 0;">Estimado ${user.nombre},</h2>
          <p>Lamentamos informarte que has **perdido el Lote #${loteId}** debido a que el plazo de 90 días para realizar el pago ha expirado.</p>
          <p style="font-weight: bold; color: #4CAF50; font-size: 1.1em;">Tu token de subasta ha sido devuelto a tu cuenta.</p>
          <p>El lote ha sido reasignado al siguiente postor.</p>
          <a href="[URL_A_TU_PERFIL]" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #0b1b36; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
              Ver Mi Cuenta
          </a>
      `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      user.email,
      subject,
      `Lote #${loteId} perdido por impago. Token devuelto.`,
      html,
    );
  },

  /**
   * Notifica a **MÚLTIPLES USUARIOS** que el proyecto alcanzó su objetivo y ha comenzado.
   * @param {object} proyecto - Proyecto de Sequelize.
   * @param {object[]} usuarios - Lista de usuarios a notificar.
   */
  async notificarInicioProyectoMasivo(proyecto, usuarios) {
    const subject = `🥳 ¡Objetivo Alcanzado! El proyecto ${proyecto.nombre_proyecto} ha comenzado.`;

    for (const usuario of usuarios) {
      if (usuario.email) {
        const contenidoInterno = `
              <h2 style="color: #4CAF50; margin-top: 0;">¡Gran Noticia, ${usuario.nombre}!</h2>
              <p>El proyecto **"${proyecto.nombre_proyecto}"** ha alcanzado el **objetivo de ${proyecto.obj_suscripciones} suscripciones**.</p>
              <p style="font-weight: bold; color: #0b1b36; font-size: 1.1em;">¡El proceso de inversión ha comenzado!</p>
              <h3 style="color: #333;">Próximos Pasos</h3>
              <ul style="list-style: disc; padding-left: 20px; line-height: 2;">
                  <li>La generación de tu **pago mensual** comenzará el día **1** del próximo mes.</li>
                  <li>El plazo de pago vencerá el día **10** de cada mes.</li>
              </ul>
              <p>Agradecemos tu apoyo. Juntos hacemos realidad este proyecto.</p>
          `;

        const html = obtenerPlantillaHtml(contenidoInterno);
        const text = `¡Felicidades, ${usuario.nombre}! El proyecto ${proyecto.nombre_proyecto} ha alcanzado el objetivo de suscripciones (${proyecto.obj_suscripciones}). La generación de pagos mensuales comenzará el día 1 del próximo mes.`;

        await this.sendEmail(usuario.email, subject, text, html);
      }
    }
  },

  /**
   * Notifica a un **ADMINISTRADOR** que un proyecto alcanzó su objetivo y ha comenzado.
   * @param {string} adminEmail - Correo del administrador.
   * @param {object} proyecto - Proyecto de Sequelize.
   */
  async notificarInicioProyectoAdmin(adminEmail, proyecto) {
    const subject = `🟢 INICIO DE PROYECTO: Objetivo Cumplido - ${proyecto.nombre_proyecto}`;

    const contenidoInterno = `
          <h2 style="color: #0b1b36; margin-top: 0;">¡El Proyecto ha Iniciado su Proceso!</h2>
          <p>El proyecto **"${proyecto.nombre_proyecto}"** (ID: ${proyecto.id}) ha alcanzado el número de suscripciones requerido (**${proyecto.obj_suscripciones}**).</p>
          <p style="font-weight: bold; color: #4CAF50; font-size: 1.1em;">Estado Actual: En proceso</p>
          <p>El sistema ha marcado la fecha de inicio del proceso y comenzará la generación de pagos mensuales.</p>
          <p>No se requiere acción inmediata, pero por favor, confirme el estado en el <a href="[URL_ADMIN_PANEL]" style="color: #FF5733; text-decoration: none; font-weight: bold;">panel de administración</a>.</p>
      `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      adminEmail,
      subject,
      `El proyecto ${proyecto.nombre_proyecto} ha comenzado su proceso de inversión.`,
      html,
    );
  },

  /**
   * Notifica a un **USUARIO/SUSCRIPTOR** la pausa de un proyecto.
   * @param {object} user - Usuario/suscriptor.
   * @param {object} proyecto - Proyecto.
   */
  async notificarPausaProyecto(user, proyecto) {
    const subject = `🚨 ¡Importante! Proyecto ${proyecto.nombre_proyecto} PAUSADO`;
    const text = `El proyecto ${proyecto.nombre_proyecto} ha sido PAUSADO temporalmente. Razón: Las suscripciones activas (${proyecto.suscripciones_actuales}) han caído por debajo del mínimo requerido (${proyecto.suscripciones_minimas}). Se reanudará cuando se alcance el objetivo de ${proyecto.obj_suscripciones}.`;

    const contenidoInterno = `
          <h2 style="color: #ffc107; margin-top: 0;">¡Tu Proyecto ha sido Pausado Temporalmente!</h2>
          <p>Hola **${user.nombre}**, lamentamos informarte que el proyecto **"${proyecto.nombre_proyecto}"** ha sido **PAUSADO** temporalmente.</p>
          <p>Razón: El número de **suscripciones activas** (${proyecto.suscripciones_actuales}) ha caído por debajo del mínimo requerido (${proyecto.suscripciones_minimas}).</p>
          <p style="font-weight: bold; color: #d9534f; font-size: 1.1em;">Consecuencia: Dejaremos de generar pagos mensuales y de descontar meses del plazo.</p>
          <p>Te notificaremos tan pronto como se reanude.</p>
      `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(user.email, subject, text, html);
  },

  /**
   * Notifica a un **ADMINISTRADOR** la reversión de un proyecto.
   * @param {string} adminEmail - Correo del admin.
   * @param {object} proyecto - Proyecto.
   */
  async notificarReversionAdmin(adminEmail, proyecto) {
    const subject = `🛑 ALERTA CRÍTICA: Proyecto Revertido - ${proyecto.nombre_proyecto}`;

    const contenidoInterno = `
          <h2 style="color: #d9534f; margin-top: 0;">¡Aviso! Proyecto Revertido a 'En Espera'</h2>
          <p>El proyecto **"${proyecto.nombre_proyecto}"** (ID: ${proyecto.id}) ha sido **REVERTIDO** a 'En Espera'.</p>
          <p>Razón: Las suscripciones activas cayeron a **${proyecto.suscripciones_actuales}** (mínimo requerido: ${proyecto.suscripciones_minimas}).</p>
          <p style="font-weight: bold; color: #d9534f; font-size: 1.1em;">Se han pausado la generación de pagos y el conteo de meses.</p>
          <p>Por favor, revise el estado del proyecto y las suscripciones asociadas en el panel de administración.</p>
      `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      adminEmail,
      subject,
      `El proyecto ${proyecto.nombre_proyecto} ha sido revertido a 'En Espera'.`,
      html,
    );
  },

  /**
   * Notifica a un **ADMINISTRADOR** que un proyecto ha completado su plazo.
   * @param {string} adminEmail - Correo del administrador.
   * @param {object} proyecto - Proyecto finalizado.
   */
  async notificarFinalizacionAdmin(adminEmail, proyecto) {
    const subject = `✅ PROYECTO FINALIZADO - Acción: ${proyecto.nombre_proyecto}`;

    const contenidoInterno = `
          <h2 style="color: #0b1b36; margin-top: 0;">¡El Plazo del Proyecto ha Terminado!</h2>
          <p>El proyecto **"${proyecto.nombre_proyecto}"** (ID: ${proyecto.id}) ha completado su plazo de **${proyecto.plazo_inversion} meses**.</p>
          <h3 style="color: #d9534f;">⚠️ Tarea Crítica Requerida</h3>
          <p>Debe ingresar al panel para realizar las siguientes acciones de cierre:</p>
          <ul style="list-style: disc; padding-left: 20px; line-height: 1.8;">
              <li>Marcar el proyecto como 'Finalizado'.</li>
              <li>Gestionar posibles **devoluciones** a suscriptores cancelados (si aplica).</li>
              <li>Revisar el estado de los **lotes** pendientes de subastar (si aplica).</li>
          </ul>
          <p style="font-weight: bold; color: #d9534f; font-size: 1.1em;">El proyecto ha dejado de contar meses y notificar pagos. **Actúe inmediatamente**.</p>
          <a href="[URL_ADMIN_PANEL]" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #0b1b36; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
              Ir al Panel de Administración
          </a>
      `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      adminEmail,
      subject,
      `El proyecto ${proyecto.nombre_proyecto} ha finalizado. Revisar cierre.`,
      html,
    );
  },

  /**
   * Notifica al usuario que se ha generado su pago mensual.
   * @param {object} user - Usuario.
   * @param {object} proyecto - Proyecto.
   * @param {number} cuota - Número de la cuota.
   * @param {number} monto - Monto del pago.
   * @param {string} fechaVencimiento - Fecha límite de pago.
   */
  async notificarPagoGenerado(user, proyecto, cuota, monto, fechaVencimiento) {
    const subject = `Recordatorio de Pago: ${proyecto.nombre_proyecto} - Cuota ${cuota}`;

    const contenidoInterno = `
          <h2 style="color: #0b1b36; margin-top: 0;">¡Tu Pago Mensual ha sido Generado!</h2>
          <p>Hola **${user.nombre}**:</p>
          <p>Tu cuota **#${cuota}** para el proyecto **"${proyecto.nombre_proyecto}"** ha sido generada.</p>
          <h3 style="color: #333;">Detalles del Pago</h3>
          <ul style="list-style: none; padding-left: 0; line-height: 2;">
              <li><strong style="color: #555;">Monto a pagar:</strong> <strong style="color: #4CAF50;">$${monto.toFixed(2)}</strong></li>
              <li><strong style="color: #555;">Cuota Nro:</strong> ${cuota}</li>
              <li><strong style="color: #FF5733;">Fecha Límite de Pago:</strong> **${fechaVencimiento}**</li>
          </ul>
          <p>Por favor, realiza el pago antes de la fecha límite para evitar recargos.</p>
          <a href="[URL_A_TU_PLATAFORMA]" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #FF5733; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
              Ir a Mis Pagos
          </a>
          <p>Gracias por tu apoyo.</p>
      `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      user.email,
      subject,
      `Se ha generado tu pago de $${monto.toFixed(2)} para el proyecto ${proyecto.nombre_proyecto}. Vence el ${fechaVencimiento}.`,
      html,
    );
  },

  /**
   * Envía un correo con el enlace para restablecer la contraseña.
   * @param {object} user - Usuario.
   * @param {string} token - Token de restablecimiento.
   */
  async sendPasswordResetEmail(user, token) {
    const resetLink = `${process.env.FRONTEND_URL}/restablecer_contrasena?token=${token}`;
    const subject = "Solicitud de Restablecimiento de Contraseña";

    const contenidoInterno = `
          <h2 style="color: #0b1b36; margin-top: 0;">Hola ${user.nombre},</h2>
          <p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el siguiente enlace:</p>
          <a href="${resetLink}" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #FF5733; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
              Restablecer Contraseña
          </a>
          <p>Si no solicitaste esto, puedes ignorar este correo. El enlace expira en 1 hora.</p>
          <small style="word-break: break-all; color: #808080;">${resetLink}</small>
      `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      user.email,
      subject,
      `Restablece tu contraseña aquí: ${resetLink}`,
      html,
    );
  },

  /**
   * Notifica al **ADMINISTRADOR** sobre un pago vencido.
   * @param {string} adminEmail - Correo del administrador.
   * @param {object} user - Usuario incumplidor.
   * @param {object} proyecto - Proyecto asociado.
   * @param {object} pago - Pago vencido.
   * @param {number} montoBase - Monto base del pago.
   * @param {number} recargoTotal - Recargo aplicado.
   */
  async notificarPagoVencidoAdmin(
    adminEmail,
    user,
    proyecto,
    pago,
    montoBase,
    recargoTotal,
  ) {
    const subject = `⚠️ PAGO VENCIDO: Acción Requerida - Usuario ${user.nombre}`;

    const contenidoInterno = `
          <h2 style="color: #d9534f; margin-top: 0;">¡ALERTA DE PAGO VENCIDO!</h2>
          <p>El usuario **${user.nombre}** (Email: ${user.email}) ha incumplido el pago de la cuota **#${pago.mes}** para el proyecto **"${proyecto.nombre_proyecto}"**.</p>
          <h3 style="color: #333;">Detalles</h3>
          <ul style="list-style: none; padding-left: 0; line-height: 2;">
              <li><strong style="color: #555;">ID Pago:</strong> ${pago.id}</li>
              <li><strong style="color: #555;">Monto Base:</strong> $${montoBase.toFixed(2)}</li>
              <li><strong style="color: #d9534f;">Monto con Recargo:</strong> $${pago.monto.toFixed(2)} (Recargo: $${recargoTotal.toFixed(2)})</li>
              <li><strong style="color: #555;">Fecha Vencimiento:</strong> ${pago.fecha_vencimiento}</li>
          </ul>
          <p style="font-weight: bold;">Se ha enviado una alerta al cliente. Por favor, realice el seguimiento correspondiente.</p>
      `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      adminEmail,
      subject,
      `Pago vencido del usuario ${user.nombre} para el proyecto ${proyecto.nombre_proyecto}.`,
      html,
    );
  },

  /**
   * @async
   * @function notificarReembolsoUsuario
   * @description Notifica al usuario que su transacción falló e informa sobre el estado del reembolso.
   * @param {object} user - Objeto del usuario (debe contener nombre y email).
   * @param {object} transaccion - Objeto de la transacción (debe contener monto, tipo_transaccion, id).
   * @param {string} motivoFallo - Razón del fallo de la lógica de negocio.
   * @param {boolean} reembolsoExitoso - Indica si el intento de reembolso en MP fue exitoso.
   */
  async notificarReembolsoUsuario(
    user,
    transaccion,
    motivoFallo,
    reembolsoExitoso,
  ) {
    if (!user || !user.email) return;

    const monto = parseFloat(transaccion.monto).toFixed(2);
    const tipoAccion = transaccion.tipo_transaccion.includes("suscripcion")
      ? "la suscripción"
      : "la inversión";

    let userSubject,
      tituloPrincipal,
      mensajeAccion,
      colorTitulo,
      mensajeAgradecimiento;

    if (reembolsoExitoso) {
      userSubject = `✅ Acción Requerida: ${tipoAccion} Fallida - Reembolso Procesado`;
      tituloPrincipal = `<h2 style="color: #4CAF50; margin-top: 0; font-size: 24px;">¡Reembolso Procesado con Éxito!</h2>`;
      colorTitulo = "#4CAF50";
      mensajeAgradecimiento = `<p>Lamentamos informarte que ${tipoAccion} (Transacción <strong>#${transaccion.id}</strong> por <strong>$${monto}</strong>) no pudo completarse. La razón principal fue: <strong>${motivoFallo}</strong>.</p>
                                  <p style="font-size: 16px;">Sin embargo, **lo más importante** es que ya hemos procesado automáticamente el reembolso.</p>`;
      mensajeAccion = `
              <div style="border-left: 5px solid #4CAF50; padding: 15px; background-color: #e6ffe6; margin-top: 20px; border-radius: 4px;">
                  <p style="color: #4CAF50; font-weight: bold; font-size: 1.1em; margin: 0;"><strong>💰 Reembolso Acreditado:</strong></p>
                  <p style="margin-top: 5px; margin-bottom: 0;">El monto de <strong>$${monto}</strong> ya fue enviado a tu medio de pago. El tiempo de acreditación depende de tu banco/tarjeta (generalmente 5-10 días hábiles).</p>
                  <p style="margin-top: 10px; margin-bottom: 0; font-weight: bold;">No necesitas realizar ninguna acción.</p>
              </div>
          `;
    } else {
      userSubject = `❌ Acción Requerida: ${tipoAccion} Fallida - Contáctanos`;
      tituloPrincipal = `<h2 style="color: #FF5733; margin-top: 0; font-size: 24px;">¡Atención! ${tipoAccion} no pudo completarse</h2>`;
      colorTitulo = "#FF5733";
      mensajeAgradecimiento = `<p>Te informamos que ${tipoAccion} (Transacción <strong>#${transaccion.id}</strong> por <strong>$${monto}</strong>) falló debido a: <strong>${motivoFallo}</strong>.</p>
                                  <p style="font-size: 16px;"><strong>Lo sentimos,</strong> pero nuestro intento de procesar el reembolso automático **no pudo completarse con éxito**.</p>`;
      mensajeAccion = `
              <div style="border-left: 5px solid #FF5733; padding: 15px; background-color: #ffe6e6; margin-top: 20px; border-radius: 4px;">
                  <p style="color: #FF5733; font-weight: bold; font-size: 1.1em; margin: 0;"><strong>🛠️ Acción Inmediata Requerida:</strong></p>
                  <p style="margin-top: 5px; margin-bottom: 0;">Para asegurar que recibas tu devolución, por favor **contáctanos inmediatamente** indicando la **Transacción #${transaccion.id}**.</p>
              </div>
              <a href="[URL_A_SOPORTE]" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: ${colorTitulo}; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Contactar a Soporte Loteplan
              </a>
          `;
    }

    const contenidoInterno = `
          ${tituloPrincipal}
          <p style="font-size: 16px; margin-bottom: 20px;">Estimado(a) <strong>${user.nombre}</strong>,</p>
          ${mensajeAgradecimiento}
          ${mensajeAccion}
          <p style="margin-top: 30px; font-size: 14px;">Lamentamos sinceramente este inconveniente. Puedes intentar realizar una nueva acción en otro proyecto si lo deseas.</p>
          <p style="margin-top: 10px; font-size: 14px;">Saludos cordiales,</p>
          <p style="font-size: 14px; font-weight: bold; margin: 0;">El Equipo de Loteplan.com</p>
      `;

    const userHtml = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      user.email,
      userSubject,
      `Notificación sobre Transacción #${transaccion.id} fallida.`,
      userHtml,
    );
  },

  /**
   * @async
   * @function notificarPagoVencidoCliente
   * @description Notifica al usuario sobre su pago vencido, incluyendo el recargo aplicado.
   * @param {object} usuario - Objeto del usuario.
   * @param {object} proyecto - Objeto del proyecto asociado.
   * @param {object} pago - Objeto del pago vencido.
   * @param {number} montoBase - Monto original sin recargos.
   * @param {number} recargoTotal - Recargo aplicado.
   */
  async notificarPagoVencidoCliente(
    usuario,
    proyecto,
    pago,
    montoBase,
    recargoTotal,
  ) {
    if (!usuario || !usuario.email) return;

    const subject = `🚨 ALERTA: ¡Tu pago para "${proyecto.nombre_proyecto}" ha VENCIDO!`;
    const montoBaseTexto = montoBase.toFixed(2);
    const montoActualTexto = pago.monto.toFixed(2);
    const recargoTotalTexto = recargoTotal.toFixed(2);

    const contenidoInterno = `
              <h2 style="color: #d9534f; margin-top: 0;">¡ATENCIÓN, PAGO VENCIDO!</h2>
              <p>Estimado/a **${usuario.nombre}**:</p>
              <p>Queremos recordarte que la cuota del **Mes ${pago.mes}** para tu suscripción al proyecto **"${proyecto.nombre_proyecto}"** ha vencido.</p>
              <h3 style="color: #333;">Detalles del Recargo</h3>
              <ul style="list-style: none; padding-left: 0; line-height: 2;">
                  <li><strong style="color: #555;">Monto Original:</strong> $${montoBaseTexto}</li>
                  <li><strong style="color: #555;">Recargo Diario Acumulado:</strong> $${recargoTotalTexto}</li>
                  <li><strong style="color: #d9534f; font-size: 1.1em;">NUEVO MONTO A PAGAR:</strong> **$${montoActualTexto}**</li>
              </ul>
              <p style="font-weight: bold;">Por favor, realiza el pago a la brevedad para evitar la suspensión de tu inversión y mayores recargos por el interés compuesto diario.</p>
              <a href="[URL_A_TUS_PAGOS]" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #d9534f; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Pagar Ahora
              </a>
          `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      usuario.email,
      subject,
      `Tu pago de $${montoActualTexto} para el proyecto ${proyecto.nombre_proyecto} ha vencido.`,
      html,
    );
  },

  /**
   * @async
   * @function notificarRecordatorioPago
   * @description Envía un recordatorio al usuario de que su pago está próximo a vencer.
   * @param {object} usuario - Objeto del usuario.
   * @param {object} proyecto - Objeto del proyecto asociado.
   * @param {object} pago - Objeto del pago.
   * @param {string} email_empresa - Email de la empresa (opcional).
   */
  async notificarRecordatorioPago(usuario, proyecto, pago, email_empresa) {
    if (!usuario || !usuario.email) return;

    const subject = `🔔 Recordatorio: Tu pago para "${proyecto.nombre_proyecto}" está por vencer`;
    const montoCuota = pago.monto.toFixed(2);
    const fechaVencimiento = new Date(
      pago.fecha_vencimiento,
    ).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const contenidoInterno = `
              <h2 style="color: #0b1b36; margin-top: 0;">¡Recordatorio de Pago!</h2>
              <p>Hola **${usuario.nombre}**:</p>
              <p>Tu cuota **#${pago.mes}** de **$${montoCuota}** para el proyecto **"${proyecto.nombre_proyecto}"** está próxima a vencer.</p>
              <h3 style="color: #FF5733;">Fecha Límite: ${fechaVencimiento}</h3>
              <p>Te recomendamos realizar el pago antes de la fecha límite para evitar los recargos por mora que se aplican diariamente.</p>
              <a href="[URL_A_TUS_PAGOS]" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #0b1b36; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Revisar y Pagar
              </a>
              <p>Gracias por tu compromiso con la inversión.</p>
          `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      usuario.email,
      subject,
      `Recordatorio: Paga $${montoCuota} para el proyecto ${proyecto.nombre_proyecto}. Vence el ${fechaVencimiento}.`,
      html,
    );
  },

  /**
   * @async
   * @function notificarReembolsoAdminMejorada
   * @description Notifica a un administrador sobre un reembolso automático con detalles del resultado.
   * @param {string} adminEmail - Correo del administrador.
   * @param {object} user - Objeto del usuario.
   * @param {object} transaccion - Objeto de la transacción.
   * @param {string} motivoFallo - Mensaje de error de la lógica de negocio.
   * @param {object} detallesReembolso - {reembolsoExitoso, errorReembolso, idPagoMP}
   */
  async notificarReembolsoAdminMejorada(
    adminEmail,
    user,
    transaccion,
    motivoFallo,
    detallesReembolso = {},
  ) {
    const {
      reembolsoExitoso = false,
      errorReembolso = null,
      idPagoMP = "N/A",
    } = detallesReembolso;

    const adminSubject = reembolsoExitoso
      ? `✅ REEMBOLSO EXITOSO: Transacción #${transaccion.id}`
      : `🚨 REEMBOLSO FALLIDO - ACCIÓN REQUERIDA: Transacción #${transaccion.id}`;

    const monto = parseFloat(transaccion.monto).toFixed(2);
    const tipoTransaccion = transaccion.tipo_transaccion || "desconocida";
    const colorTitulo = reembolsoExitoso ? "#4CAF50" : "#d9534f";

    const estadoReembolso = reembolsoExitoso
      ? `<p style="color: #4CAF50; font-weight: bold; border-left: 3px solid #4CAF50; padding-left: 10px;">✅ El reembolso fue procesado exitosamente por Mercado Pago.</p>`
      : `<p style="color: #d9534f; font-weight: bold; border-left: 3px solid #d9534f; padding-left: 10px;">⚠️ EL REEMBOLSO FALLÓ. Debes realizarlo MANUALMENTE.</p>
                  <p style="background-color: #fff3cd; padding: 10px; border-left: 3px solid #ffc107; font-size: 0.9em;">
                      <strong>Error del API:</strong> ${errorReembolso || "Sin detalles del error"}
                  </p>`;

    const accionRequerida = reembolsoExitoso
      ? `<p style="color: #6c757d;">No se requiere acción adicional. El usuario recibirá el reembolso en 5-10 días hábiles.</p>`
      : `<p style="font-weight: bold; font-size: 1.1em; color: #d9534f;">⚠️ ACCIÓN CRÍTICA REQUERIDA:</p>
                  <ol style="line-height: 1.8; padding-left: 20px;">
                      <li>Ingresa al panel de <a href="https://www.mercadopago.com.ar/activities" target="_blank" style="color: #FF5733; font-weight: bold;">Mercado Pago</a></li>
                      <li>Busca el pago con ID: <strong>${idPagoMP}</strong></li>
                      <li>Realiza el reembolso manual de <strong>$${monto}</strong></li>
                      <li>Contacta al usuario para confirmar: ${user.email}</li>
                  </ol>`;

    const contenidoInterno = `
              <h2 style="color: ${colorTitulo}; margin-top: 0;">${reembolsoExitoso ? "✅ Reembolso Procesado" : "🚨 ALERTA CRÍTICA"}</h2>
              <p>El pago de <strong>$${monto}</strong> del usuario <strong>${user.nombre}</strong> (ID: ${user.id}, Email: ${user.email}) fue aprobado por MP, pero el sistema no pudo procesar la lógica de negocio (${tipoTransaccion}).</p>

              <h3 style="color: #0b1b36;">📋 Detalles del Fallo y Transacción</h3>
              <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 0.95em;">
                  <tr style="background-color: #f8f9fa;">
                      <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Transacción ID:</strong></td>
                      <td style="padding: 10px; border: 1px solid #dee2e6;">${transaccion.id}</td>
                  </tr>
                  <tr>
                      <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>ID Pago MP:</strong></td>
                      <td style="padding: 10px; border: 1px solid #dee2e6;">${idPagoMP}</td>
                  </tr>
                  <tr style="background-color: #fff3cd;">
                      <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Motivo Fallo Interno:</strong></td>
                      <td style="padding: 10px; border: 1px solid #dee2e6;">${motivoFallo}</td>
                  </tr>
              </table>

              <h3 style="color: #0b1b36;">⚙️ Resultado del Proceso Automático</h3>
              ${estadoReembolso}
              ${accionRequerida}

              <p style="font-size: 0.9em; color: #6c757d; margin-top: 20px;">
                  💡 <strong>Causa raíz probable:</strong> ${
                    motivoFallo.includes("cupos")
                      ? "El proyecto alcanzó su capacidad mientras el usuario pagaba."
                      : motivoFallo.includes("expiró")
                        ? "La transacción tardó más de 30 minutos en confirmarse."
                        : "Estado del proyecto cambió durante el proceso de pago."
                  }
              </p>
          `;

    const adminHtml = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      adminEmail,
      adminSubject,
      `Reembolso ${reembolsoExitoso ? "exitoso" : "FALLIDO - Acción requerida"} para Transacción #${transaccion.id} del usuario ${user.email}. Motivo: ${motivoFallo}`,
      adminHtml,
    );
  },

  /**
   * @async
   * @function notificarSuscripcionExitosa
   * @description Confirma al usuario que su suscripción al proyecto se completó con éxito.
   * @param {string} userEmail - Correo del usuario.
   * @param {object} proyecto - Objeto del proyecto asociado.
   */
  async notificarSuscripcionExitosa(userEmail, proyecto) {
    if (!userEmail) return;

    const subject = `✅ ¡Suscripción Exitosa! Bienvenido a "${proyecto.nombre_proyecto}"`;
    const montoCuota = parseFloat(proyecto.monto_suscripcion || 0).toFixed(2);

    const contenidoInterno = `
          <h2 style="color: #4CAF50; margin-top: 0;">¡Felicidades, tu inversión ha comenzado!</h2>
          <p>Tu suscripción al proyecto **"${proyecto.nombre_proyecto}"** ha sido confirmada y registrada exitosamente en nuestro sistema. ¡Estás a bordo!</p>

          <h3 style="color: #0b1b36;">Detalles de tu Inversión Inicial</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px;">
              <tr>
                  <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Proyecto:</strong></td>
                  <td style="padding: 10px; border: 1px solid #dee2e6;">${proyecto.nombre_proyecto}</td>
              </tr>
              <tr>
                  <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Monto Inicial Pagado:</strong></td>
                  <td style="padding: 10px; border: 1px solid #dee2e6;"><strong style="color: #4CAF50;">$${montoCuota}</strong></td>
              </tr>
              <tr>
                  <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Plazo Total:</strong></td>
                  <td style="padding: 10px; border: 1px solid #dee2e6;">${proyecto.plazo_inversion} meses</td>
              </tr>
          </table>
          
          <p style="font-weight: bold; margin-top: 20px;">Mantente atento a las actualizaciones del proyecto en tu panel de control.</p>
          <a href="[URL_A_PANEL_USUARIO]" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #0b1b36; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
              Ir a Mi Panel
          </a>
      `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      userEmail,
      subject,
      `Confirmación de Suscripción al proyecto ${proyecto.nombre_proyecto}.`,
      html,
    );
  },

  /**
   * @async
   * @function notificarPagoRecibido
   * @description Notifica al usuario que su pago mensual ha sido procesado exitosamente.
   * @param {object} usuario - Objeto del usuario.
   * @param {object} proyecto - Objeto del proyecto.
   * @param {number} monto - Monto del pago procesado.
   * @param {number} mesPago - Número de la cuota pagada.
   */
  async notificarPagoRecibido(usuario, proyecto, monto, mesPago) {
    if (!usuario || !usuario.email) return;

    const subject = `✅ Pago Confirmado - Cuota #${mesPago} del Proyecto "${proyecto.nombre_proyecto}"`;
    const montoTexto = parseFloat(monto).toFixed(2);

    const contenidoInterno = `
      <h2 style="color: #4CAF50; margin-top: 0;">¡Pago Recibido con Éxito!</h2>
      <p>Hola <strong>${usuario.nombre}</strong>,</p>
      <p>Te confirmamos que hemos recibido tu pago de <strong style="color: #4CAF50;">$${montoTexto}</strong> correspondiente a la <strong>cuota #${mesPago}</strong> del proyecto <strong>"${proyecto.nombre_proyecto}"</strong>.</p>
      
      <div style="border: 1px solid #4CAF50; padding: 15px; background-color: #e6ffe6; margin: 20px 0;">
        <p style="margin: 0; font-weight: bold; color: #4CAF50;">✅ Tu inversión está al día</p>
      </div>

      <h3 style="color: #0b1b36;">Detalles del Pago</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px;">
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Proyecto:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${proyecto.nombre_proyecto}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Cuota:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">#${mesPago}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Monto Pagado:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong style="color: #4CAF50;">$${montoTexto}</strong></td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Fecha:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${new Date().toLocaleDateString("es-ES")}</td>
        </tr>
      </table>

      <p style="margin-top: 20px;">¡Gracias por tu compromiso con este proyecto!</p>
      
      <a href="[URL_A_TU_PANEL]" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #0b1b36; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
        Ver Mi Panel de Inversiones
      </a>
    `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      usuario.email,
      subject,
      `Tu pago de $${montoTexto} para la cuota #${mesPago} del proyecto ${proyecto.nombre_proyecto} ha sido procesado exitosamente.`,
      html,
    );
  },

  /**
   * @async
   * @function notificarDesactivacionCuenta
   * @description Notifica al usuario que su cuenta ha sido desactivada exitosamente.
   * @param {object} usuario - Objeto del usuario (debe contener nombre, email, nombre_usuario).
   */
  async notificarDesactivacionCuenta(usuario) {
    if (!usuario || !usuario.email) return;

    const subject = `✅ Confirmación: Tu cuenta ha sido desactivada - Loteplan.com`;
    const fechaDesactivacion = new Date().toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const contenidoInterno = `
      <h2 style="color: #0b1b36; margin-top: 0;">Confirmación de Desactivación de Cuenta</h2>
      <p>Estimado/a <strong>${usuario.nombre}</strong>,</p>
      <p>Te confirmamos que tu cuenta (<strong>${usuario.nombre_usuario}</strong>) ha sido desactivada exitosamente el <strong>${fechaDesactivacion}</strong>.</p>

      <div style="border-left: 4px solid #ffc107; padding: 15px; background-color: #fff9e6; margin: 20px 0;">
        <h3 style="color: #856404; margin-top: 0; font-size: 16px;">⚠️ Consecuencias de la Desactivación</h3>
        <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.8; color: #856404;">
          <li>Ya <strong>no podrás acceder</strong> a tu cuenta con tus credenciales actuales</li>
          <li>Tu perfil y publicaciones ya <strong>no serán visibles</strong> para otros usuarios</li>
          <li>No recibirás notificaciones ni correos electrónicos del sistema</li>
          <li><strong>No podrás descargar contratos firmados</strong> ni acceder a documentos anteriores</li>
        </ul>
      </div>

      <h3 style="color: #0b1b36;">📋 Datos Importantes Sobre Tu Desactivación</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px;">
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Usuario:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${usuario.nombre_usuario}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Email:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${usuario.email}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Fecha de Desactivación:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${fechaDesactivacion}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Estado Actual:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><span style="color: #d9534f; font-weight: bold;">Inactiva</span></td>
        </tr>
      </table>

      <div style="border-left: 4px solid #4CAF50; padding: 15px; background-color: #e6ffe6; margin: 20px 0;">
        <h3 style="color: #2e7d32; margin-top: 0; font-size: 16px;">💡 ¿Cambiaste de Opinión?</h3>
        <p style="margin: 5px 0; color: #2e7d32;">Si deseas <strong>reactivar tu cuenta</strong> en el futuro, puedes contactarnos en cualquier momento:</p>
        <p style="margin: 10px 0;">
          <strong>Email de Soporte:</strong> <a href="mailto:soporte@loteplan.com" style="color: #0b1b36; text-decoration: none; font-weight: bold;">soporte@loteplan.com</a>
        </p>
        <p style="margin: 5px 0; font-size: 13px; color: #555;">Necesitaremos verificar tu identidad antes de proceder con la reactivación.</p>
      </div>

      <h3 style="color: #0b1b36;">🔐 Recordatorios Importantes</h3>
      <ul style="line-height: 1.8; padding-left: 20px;">
        <li>Si tenías <strong>pujas ganadoras pendientes de pago</strong>, aún tienes 90 días para completar el pago. Después de ese período, perderás el lote.</li>
        <li>Si tenías <strong>contratos firmados</strong>, te recomendamos que los hayas descargado antes de desactivar tu cuenta, ya que ya no podrás acceder a ellos.</li>
        <li>Tus datos personales se mantienen almacenados de forma segura según nuestra política de privacidad.</li>
      </ul>

      <p style="margin-top: 30px; color: #555;">Lamentamos verte partir. Si hay algo que podamos mejorar, no dudes en compartir tu opinión con nosotros.</p>
      
      <p style="margin-top: 20px;">Saludos cordiales,</p>
      <p style="font-weight: bold; margin: 5px 0;">El Equipo de Loteplan.com</p>
    `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    const textPlain = `
  Confirmación de Desactivación de Cuenta

  Estimado/a ${usuario.nombre},

  Tu cuenta (${usuario.nombre_usuario}) ha sido desactivada exitosamente el ${fechaDesactivacion}.

  Consecuencias:
  - No podrás acceder a tu cuenta
  - Tu perfil ya no será visible
  - No recibirás más notificaciones
  - No podrás descargar contratos firmados

  Si deseas reactivar tu cuenta en el futuro, contáctanos en: soporte@loteplan.com

  Saludos,
  El Equipo de Loteplan.com
    `.trim();

    await this.sendEmail(usuario.email, subject, textPlain, html);
  },
  async notificarSolicitudCancelacionPuja(
    adminEmail,
    { puja, usuario, motivo },
  ) {
    const subject = `⚠️ Solicitud de Cancelación de Puja Ganadora — Lote #${puja.id_lote}`;

    const fechaSolicitud = new Date().toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const fechaVencimiento = puja.fecha_vencimiento_pago
      ? new Date(puja.fecha_vencimiento_pago).toLocaleDateString("es-ES", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "N/A";

    const contenidoInterno = `
    <h2 style="color: #ffc107; margin-top: 0;">⚠️ Solicitud de Cancelación de Puja Ganadora</h2>
    <p>El usuario <strong>${usuario.nombre} ${usuario.apellido}</strong> ha solicitado cancelar su puja ganadora pendiente de pago. Por favor, revisá el caso y tomá la acción correspondiente.</p>

    <div style="border-left: 4px solid #ffc107; padding: 15px; background-color: #fff9e6; margin: 20px 0;">
      <h3 style="color: #856404; margin-top: 0; font-size: 16px;">📋 Motivo Informado por el Usuario</h3>
      <p style="margin: 5px 0; color: #856404; font-style: italic;">"${motivo}"</p>
    </div>

    <h3 style="color: #0b1b36;">👤 Datos del Usuario</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px;">
      <tr>
        <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Nombre:</strong></td>
        <td style="padding: 10px; border: 1px solid #dee2e6;">${usuario.nombre} ${usuario.apellido}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Usuario:</strong></td>
        <td style="padding: 10px; border: 1px solid #dee2e6;">${usuario.nombre_usuario}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Email:</strong></td>
        <td style="padding: 10px; border: 1px solid #dee2e6;">
          <a href="mailto:${usuario.email}" style="color: #0b1b36; text-decoration: none;">${usuario.email}</a>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>ID Usuario:</strong></td>
        <td style="padding: 10px; border: 1px solid #dee2e6;">${usuario.id}</td>
      </tr>
    </table>

    <h3 style="color: #0b1b36;">🏷️ Datos de la Puja</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px;">
      <tr>
        <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>ID Puja:</strong></td>
        <td style="padding: 10px; border: 1px solid #dee2e6;">${puja.id}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Lote:</strong></td>
        <td style="padding: 10px; border: 1px solid #dee2e6;">#${puja.id_lote} — ${puja.lote?.nombre_lote || "N/A"}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Monto de la Puja:</strong></td>
        <td style="padding: 10px; border: 1px solid #dee2e6;"><strong style="color: #4CAF50;">$${parseFloat(puja.monto_puja).toFixed(2)}</strong></td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Vencimiento de Pago:</strong></td>
        <td style="padding: 10px; border: 1px solid #dee2e6; color: #d9534f;"><strong>${fechaVencimiento}</strong></td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Fecha Solicitud:</strong></td>
        <td style="padding: 10px; border: 1px solid #dee2e6;">${fechaSolicitud}</td>
      </tr>
    </table>

    <div style="border-left: 4px solid #0b1b36; padding: 15px; background-color: #f0f4ff; margin: 20px 0;">
      <h3 style="color: #0b1b36; margin-top: 0; font-size: 16px;">🛠️ Acciones Disponibles</h3>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 2;">
        <li><strong>Cancelar la puja:</strong> Si el usuario no puede pagar, ejecutá la cancelación desde el panel para reasignar el lote al siguiente postor.</li>
        <li><strong>Contactar al usuario:</strong> Si considerás que el usuario puede llegar a pagar, contactalo directamente antes de tomar una decisión.</li>
        <li><strong>Extender el plazo:</strong> Si la situación lo amerita, podés extender la fecha límite de pago desde el panel.</li>
      </ul>
    </div>

    <a href="${process.env.FRONTEND_URL}/admin/pujas/${puja.id}" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #0b1b36; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
      Ir al Panel de Administración
    </a>

    <p style="margin-top: 10px; font-size: 13px; color: #6c757d;">
      Este aviso fue generado automáticamente por el sistema. El usuario fue notificado de que su solicitud está siendo revisada.
    </p>
  `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    const textPlain = `
Solicitud de Cancelación de Puja Ganadora

Usuario: ${usuario.nombre} ${usuario.apellido} (${usuario.email})
Puja ID: ${puja.id} — Lote #${puja.id_lote} (${puja.lote?.nombre_lote || "N/A"})
Monto: $${parseFloat(puja.monto_puja).toFixed(2)}
Vencimiento de pago: ${fechaVencimiento}
Motivo informado: ${motivo}
Fecha de solicitud: ${fechaSolicitud}

Ingresá al panel de administración para decidir la acción a tomar.
  `.trim();

    await this.sendEmail(adminEmail, subject, textPlain, html);
  },

  /**
   * @async
   * @function notificarReactivacionCuenta
   * @description Notifica al usuario que su cuenta ha sido reactivada exitosamente.
   * @param {object} usuario - Objeto del usuario (debe contener nombre, email, nombre_usuario).
   */
  async notificarReactivacionCuenta(usuario) {
    if (!usuario || !usuario.email) return;

    const subject = `🎉 ¡Bienvenido de Nuevo! Tu cuenta ha sido reactivada - Loteplan.com`;
    const fechaReactivacion = new Date().toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const contenidoInterno = `
      <h2 style="color: #4CAF50; margin-top: 0;">¡Tu Cuenta ha Sido Reactivada!</h2>
      <p>Estimado/a <strong>${usuario.nombre}</strong>,</p>
      <p>Nos complace informarte que tu cuenta (<strong>${usuario.nombre_usuario}</strong>) ha sido <strong>reactivada exitosamente</strong> el <strong>${fechaReactivacion}</strong>.</p>

      <div style="border-left: 4px solid #4CAF50; padding: 15px; background-color: #e6ffe6; margin: 20px 0;">
        <h3 style="color: #2e7d32; margin-top: 0; font-size: 16px;">✅ ¡Ya Puedes Acceder Nuevamente!</h3>
        <p style="margin: 5px 0; color: #2e7d32;">Tu cuenta está completamente activa y puedes iniciar sesión con tus credenciales actuales.</p>
      </div>

      <h3 style="color: #0b1b36;">📋 Información de Tu Cuenta Reactivada</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px;">
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Usuario:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${usuario.nombre_usuario}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Email:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${usuario.email}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Fecha de Reactivación:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${fechaReactivacion}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Estado Actual:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><span style="color: #4CAF50; font-weight: bold;">✅ Activa</span></td>
        </tr>
      </table>

      <h3 style="color: #0b1b36;">🔓 ¿Qué Puedes Hacer Ahora?</h3>
      <ul style="line-height: 1.8; padding-left: 20px;">
        <li>Acceder a tu panel de usuario con tu email y contraseña</li>
        <li>Ver y gestionar tus inversiones y suscripciones</li>
        <li>Participar en subastas de lotes</li>
        <li>Descargar tus contratos firmados (si aplica)</li>
        <li>Actualizar tu perfil y preferencias</li>
      </ul>

      <div style="border-left: 4px solid #ffc107; padding: 15px; background-color: #fff9e6; margin: 20px 0;">
        <h3 style="color: #856404; margin-top: 0; font-size: 16px;">⚠️ Recordatorio Importante</h3>
        <p style="margin: 5px 0; color: #856404;">Si olvidaste tu contraseña, puedes restablecerla usando la opción "¿Olvidaste tu contraseña?" en la página de inicio de sesión.</p>
        <p style="margin: 5px 0; color: #856404;">Recuerda que tus seguridades fueron desactivadas (2FA), necesitas activarlas nuevamente para realizar operaciones por medio de la página.</p>
      </div>

      <a href="${process.env.FRONTEND_URL}" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
        Iniciar Sesión Ahora
      </a>

      <p style="margin-top: 30px; color: #555;">¡Nos alegra tenerte de vuelta! Si tienes alguna pregunta o necesitas asistencia, no dudes en contactarnos.</p>
      
      <p style="margin-top: 20px;">Saludos cordiales,</p>
      <p style="font-weight: bold; margin: 5px 0;">El Equipo de Loteplan.com</p>
    `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    const textPlain = `
  ¡Tu Cuenta ha Sido Reactivada!

  Estimado/a ${usuario.nombre},

  Tu cuenta (${usuario.nombre_usuario}) ha sido reactivada exitosamente el ${fechaReactivacion}.

  Ya puedes acceder nuevamente a tu cuenta con tus credenciales actuales.

  Información de tu cuenta:
  - Usuario: ${usuario.nombre_usuario}
  - Email: ${usuario.email}
  - Estado: Activa ✅

  ¡Nos alegra tenerte de vuelta!

  Saludos,
  El Equipo de Loteplan.com
    `.trim();

    await this.sendEmail(usuario.email, subject, textPlain, html);
  },
  /**
   * @async
   * @function notificarCancelacionSuscripcion
   * @description Notifica al usuario que su suscripción ha sido cancelada exitosamente.
   * @param {string} userEmail - Correo del usuario.
   * @param {object} proyecto - Objeto del proyecto asociado.
   * @param {object} metrics - Métricas de la cancelación (pagos_cancelados, pagos_realizados, monto_total_pagado).
   */
  async notificarCancelacionSuscripcion(userEmail, proyecto, metrics) {
    if (!userEmail) return;

    const subject = `✅ Confirmación: Tu suscripción a "${proyecto.nombre_proyecto}" ha sido cancelada`;
    const fechaCancelacion = new Date().toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const {
      pagos_cancelados = 0,
      pagos_realizados = 0,
      monto_total_pagado = 0,
    } = metrics;
    const montoTexto = parseFloat(monto_total_pagado).toFixed(2);

    const contenidoInterno = `
      <h2 style="color: #0b1b36; margin-top: 0;">Confirmación de Cancelación de Suscripción</h2>
      <p>Estimado/a usuario,</p>
      <p>Te confirmamos que tu suscripción al proyecto <strong>"${proyecto.nombre_proyecto}"</strong> ha sido <strong>cancelada exitosamente</strong> el <strong>${fechaCancelacion}</strong>.</p>

      <div style="border-left: 4px solid #ffc107; padding: 15px; background-color: #fff9e6; margin: 20px 0;">
        <h3 style="color: #856404; margin-top: 0; font-size: 16px;">📊 Resumen de tu Cancelación</h3>
        <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.8; color: #856404;">
          <li><strong>Pagos realizados:</strong> ${pagos_realizados} cuota(s)</li>
          <li><strong>Monto total pagado:</strong> <strong style="color: #4CAF50;">$${montoTexto}</strong></li>
          <li><strong>Pagos cancelados (pendientes/vencidos):</strong> ${pagos_cancelados} cuota(s)</li>
        </ul>
      </div>

      <h3 style="color: #0b1b36;">📋 Detalles de la Cancelación</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px;">
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Proyecto:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${proyecto.nombre_proyecto}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Fecha de Cancelación:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${fechaCancelacion}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Estado:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><span style="color: #d9534f; font-weight: bold;">Cancelada</span></td>
        </tr>
      </table>

      <div style="border-left: 4px solid #4CAF50; padding: 15px; background-color: #e6ffe6; margin: 20px 0;">
        <h3 style="color: #2e7d32; margin-top: 0; font-size: 16px;">💰 Información Importante sobre Devoluciones</h3>
        <p style="margin: 5px 0; color: #2e7d32;">El equipo de Loteplan revisará tu caso para determinar si corresponde alguna devolución del monto pagado, según las políticas de cancelación del proyecto.</p>
        <p style="margin: 10px 0; color: #2e7d32;">Si tienes alguna duda sobre este proceso, por favor contáctanos a <strong>soporte@loteplan.com</strong>.</p>
      </div>

      <h3 style="color: #0b1b36;">🔐 Recordatorios Importantes</h3>
      <ul style="line-height: 1.8; padding-left: 20px;">
        <li>Si tenías <strong>pujas activas</strong> en este proyecto, han sido desactivadas automáticamente.</li>
        <li>No se generarán más pagos mensuales para este proyecto.</li>
        <li>Puedes suscribirte nuevamente al proyecto si está disponible, siempre que haya cupos disponibles.</li>
      </ul>

      <p style="margin-top: 30px; color: #555;">Lamentamos verte partir de este proyecto. Si hay algo que podamos mejorar, no dudes en compartir tu opinión con nosotros.</p>
      
      <a href="${process.env.FRONTEND_URL}/mis-suscripciones" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #0b1b36; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
        Ver Mis Suscripciones
      </a>

      <p style="margin-top: 20px;">Saludos cordiales,</p>
      <p style="font-weight: bold; margin: 5px 0;">El Equipo de Loteplan.com</p>
    `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    const textPlain = `
  Confirmación de Cancelación de Suscripción

  Tu suscripción al proyecto "${proyecto.nombre_proyecto}" ha sido cancelada exitosamente el ${fechaCancelacion}.

  Resumen:
  - Pagos realizados: ${pagos_realizados} cuota(s)
  - Monto total pagado: $${montoTexto}
  - Pagos cancelados (pendientes/vencidos): ${pagos_cancelados} cuota(s)

  El equipo de Loteplan revisará tu caso para determinar si corresponde alguna devolución.

  Si tienes dudas, contáctanos en: soporte@loteplan.com

  Saludos,
  El Equipo de Loteplan.com
    `.trim();

    await this.sendEmail(userEmail, subject, textPlain, html);
  },
  // ==================== NUEVAS FUNCIONES PARA ADHESIONES ====================

  /**
   * Notifica al usuario que ha creado un plan de pagos de adhesión.
   */
  async notificarAdhesionCreada(user, adhesion, proyecto, planPago) {
    const subject = `Plan de pagos iniciado para "${proyecto.nombre_proyecto}"`;
    const montoTotal = parseFloat(adhesion.monto_total_adhesion).toFixed(2);
    const montoPorCuota = (
      adhesion.monto_total_adhesion / adhesion.cuotas_totales
    ).toFixed(2);
    const cuotasTotales = adhesion.cuotas_totales;
    let planTexto = "";
    if (planPago === "contado") planTexto = "Pago de contado (1 cuota)";
    else if (planPago === "6_cuotas") planTexto = "6 cuotas mensuales";
    else planTexto = "12 cuotas mensuales";

    const contenidoInterno = `
    <h2 style="color: #0b1b36;">¡Plan de pagos registrado!</h2>
    <p>Hola <strong>${user.nombre}</strong>,</p>
    <p>Has iniciado el plan de adhesión para el proyecto <strong>"${proyecto.nombre_proyecto}"</strong>.</p>
    <h3>Detalles del plan:</h3>
    <ul>
      <li><strong>Plan elegido:</strong> ${planTexto}</li>
      <li><strong>Monto total de adhesión (4% del valor móvil):</strong> $${montoTotal}</li>
      <li><strong>Monto por cuota:</strong> $${montoPorCuota}</li>
      <li><strong>Total cuotas:</strong> ${cuotasTotales}</li>
    </ul>
    <p>Las fechas de vencimiento de cada cuota son el día <strong>10 de cada mes</strong>. Recibirás recordatorios y podrás pagar desde tu panel de usuario.</p>
    <p style="font-weight: bold;">Recuerda que una vez que completes el 100% de las cuotas, tu suscripción al proyecto se activará automáticamente.</p>
    <a href="${process.env.FRONTEND_URL}/mis-adhesiones" style="display: inline-block; padding: 12px 25px; background-color: #0b1b36; color: white; text-decoration: none; border-radius: 5px;">Ver mis adhesiones</a>
  `;
    const html = obtenerPlantillaHtml(contenidoInterno);
    await this.sendEmail(
      user.email,
      subject,
      `Plan de pagos creado para ${proyecto.nombre_proyecto}`,
      html,
    );
  },

  /**
   * Notifica al usuario que una cuota de adhesión ha sido pagada.
   */
  async notificarCuotaAdhesionPagada(user, adhesion, cuota, proyecto) {
    const subject = `Pago de cuota #${cuota.numero_cuota} de adhesión confirmado - ${proyecto.nombre_proyecto}`;
    const montoPagado = parseFloat(cuota.monto).toFixed(2);
    const cuotasRestantes = adhesion.cuotas_totales - adhesion.cuotas_pagadas;

    const contenidoInterno = `
    <h2 style="color: #4CAF50;">¡Pago registrado!</h2>
    <p>Hola <strong>${user.nombre}</strong>,</p>
    <p>Hemos recibido el pago de la <strong>cuota #${cuota.numero_cuota}</strong> del plan de adhesión para el proyecto <strong>"${proyecto.nombre_proyecto}"</strong>.</p>
    <ul>
      <li><strong>Monto pagado:</strong> $${montoPagado}</li>
      <li><strong>Cuotas pagadas hasta ahora:</strong> ${adhesion.cuotas_pagadas} de ${adhesion.cuotas_totales}</li>
      <li><strong>Cuotas restantes:</strong> ${cuotasRestantes}</li>
    </ul>
    ${cuotasRestantes === 0 ? '<p style="color: #4CAF50; font-weight: bold;">🎉 ¡Felicidades! Has completado el pago total de la adhesión. Tu suscripción al proyecto será activada en breve.</p>' : ""}
    <a href="${process.env.FRONTEND_URL}/mis-adhesiones/${adhesion.id}" style="display: inline-block; padding: 12px 25px; background-color: #0b1b36; color: white; text-decoration: none; border-radius: 5px;">Ver detalles</a>
  `;
    const html = obtenerPlantillaHtml(contenidoInterno);
    await this.sendEmail(
      user.email,
      subject,
      `Pago cuota #${cuota.numero_cuota} de adhesión confirmado`,
      html,
    );
  },
  /**
   * Notifica al usuario que su período de pausa (standby) ha finalizado
   * y que la generación de cuotas se reanudará normalmente.
   * @param {object} usuario - Objeto del usuario (nombre, email)
   * @param {object} proyecto - Proyecto asociado
   */
  async notificarStandbyFinalizado(usuario, proyecto) {
    if (!usuario || !usuario.email) return;

    const subject = `🟢 Tu período de pausa ha terminado - ${proyecto.nombre_proyecto}`;
    const fechaHoy = new Date().toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const contenidoInterno = `
    <h2 style="color: #4CAF50; margin-top: 0;">¡Tu período de pausa ha finalizado!</h2>
    <p>Hola <strong>${usuario.nombre}</strong>,</p>
    <p>El período de pausa de <strong>6 meses</strong> que solicitaste para el proyecto <strong>"${proyecto.nombre_proyecto}"</strong> ha terminado el día <strong>${fechaHoy}</strong>.</p>
    
    <div style="border-left: 4px solid #FF5733; padding: 15px; background-color: #fff3e0; margin: 20px 0;">
      <h3 style="color: #d9534f; margin-top: 0; font-size: 16px;">📌 ¿Qué sucede ahora?</h3>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.8;">
        <li>Se <strong>reactivarán automáticamente</strong> tus cuotas mensuales de inversión.</li>
        <li>En los próximos días comenzará a generarse tu próxima cuota según el cronograma original.</li>
        <li>Recibirás un recordatorio de pago con la fecha de vencimiento correspondiente.</li>
      </ul>
    </div>

    <p style="margin-top: 20px;">Si deseas <strong>cancelar tu suscripción</strong> o solicitar una nueva pausa, por favor contacta con el equipo de administración.</p>
    
    <a href="${process.env.FRONTEND_URL}/mis-suscripciones" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #0b1b36; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
      Ver Mis Suscripciones
    </a>

    <p style="margin-top: 20px;">Saludos cordiales,<br>El Equipo de Loteplan.com</p>
  `;

    const html = obtenerPlantillaHtml(contenidoInterno);
    const textPlain = `Tu período de pausa para el proyecto ${proyecto.nombre_proyecto} ha terminado. Se reanudará la generación de cuotas.`;

    await this.sendEmail(usuario.email, subject, textPlain, html);
  },
  /**
 * Notifica al usuario que un administrador ha activado el período de pausa (standby) de 6 meses.
 * @param {object} usuario - Objeto del usuario (nombre, email)
 * @param {object} proyecto - Proyecto asociado
 * @param {Date|string} fechaFin - Fecha en que finaliza la pausa (YYYY-MM-DD)
 */
async notificarStandbyActivado(usuario, proyecto, fechaFin) {
  if (!usuario || !usuario.email) return;

  const fechaFormateada = new Date(fechaFin).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const subject = `🔵 Período de pausa activado - ${proyecto.nombre_proyecto}`;

  const contenidoInterno = `
    <h2 style="color: #0b1b36; margin-top: 0;">Se ha activado un período de pausa en tu suscripción</h2>
    <p>Hola <strong>${usuario.nombre}</strong>,</p>
    <p>Por gestión administrativa, se ha activado un <strong>período de pausa de 6 meses</strong> en tu suscripción al proyecto <strong>"${proyecto.nombre_proyecto}"</strong>.</p>
    
    <div style="border-left: 4px solid #FF5733; padding: 15px; background-color: #fff3e0; margin: 20px 0;">
      <h3 style="color: #d9534f; margin-top: 0; font-size: 16px;">📌 ¿Qué significa esto?</h3>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.8;">
        <li><strong>No se generarán nuevas cuotas mensuales</strong> durante este período.</li>
        <li>El contador de <strong>meses_a_pagar se detiene</strong> y se reanudará al finalizar la pausa.</li>
        <li>No perderás tu lugar en el proyecto ni los meses ya pagados.</li>
      </ul>
    </div>

    <p><strong>Fecha de finalización de la pausa:</strong> ${fechaFormateada}</p>
    <p>A partir de esa fecha, el sistema reactivará automáticamente la generación de tus cuotas.</p>
    
    <p style="margin-top: 20px;">Si tienes dudas, contacta con el equipo de soporte.</p>
    
    <a href="${process.env.FRONTEND_URL}/mis-suscripciones" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #0b1b36; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
      Ver Mis Suscripciones
    </a>

    <p>Saludos,<br>El Equipo de Loteplan.com</p>
  `;

  const html = obtenerPlantillaHtml(contenidoInterno);
  const textPlain = `Se ha activado una pausa de 6 meses en tu suscripción a ${proyecto.nombre_proyecto}. No se generarán cuotas hasta el ${fechaFormateada}.`;

  await this.sendEmail(usuario.email, subject, textPlain, html);
},

  /**
   * Notifica al usuario que ha completado todas las cuotas y su suscripción está activa.
   */
  async notificarAdhesionCompletada(user, adhesion, suscripcion, proyecto) {
    const subject = `🎉 ¡Adhesión completada! Tu suscripción a "${proyecto.nombre_proyecto}" ya está activa`;
    const contenidoInterno = `
    <h2 style="color: #4CAF50;">¡Proceso exitoso!</h2>
    <p>Hola <strong>${user.nombre}</strong>,</p>
    <p>Has completado el pago total del <strong>${adhesion.cuotas_totales} cuotas</strong> del plan de adhesión para el proyecto <strong>"${proyecto.nombre_proyecto}"</strong>.</p>
    <p style="font-weight: bold; font-size: 1.1em;">✅ Tu suscripción ya está activa y cuentas con <strong>1 token de inversión</strong> disponible para participar en las subastas de lotes de este proyecto.</p>
    <p>A partir de ahora, se generarán tus cuotas mensuales de inversión (el monto mensual del proyecto) y deberás pagarlas antes del día 10 de cada mes.</p>
    <a href="${process.env.FRONTEND_URL}/mis-suscripciones" style="display: inline-block; padding: 12px 25px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Ir a mis suscripciones</a>
  `;
    const html = obtenerPlantillaHtml(contenidoInterno);
    await this.sendEmail(
      user.email,
      subject,
      `Adhesión completada - Suscripción activa`,
      html,
    );
  },

  /**
   * Notifica al usuario que su adhesión ha sido cancelada.
   */
  async notificarAdhesionCancelada(user, adhesion, proyecto, motivo) {
    const subject = `Adhesión cancelada - ${proyecto.nombre_proyecto}`;
    const motivoTexto = motivo || "No especificado";
    const contenidoInterno = `
    <h2 style="color: #d9534f;">Adhesión cancelada</h2>
    <p>Hola <strong>${user.nombre}</strong>,</p>
    <p>Te informamos que tu plan de adhesión para el proyecto <strong>"${proyecto.nombre_proyecto}"</strong> ha sido cancelado.</p>
    <p><strong>Motivo de cancelación:</strong> ${motivoTexto}</p>
    <p>Si no solicitaste esta cancelación o necesitas más información, por favor contacta a nuestro equipo de soporte.</p>
    <a href="mailto:soporte@loteplan.com" style="display: inline-block; padding: 12px 25px; background-color: #0b1b36; color: white; text-decoration: none; border-radius: 5px;">Contactar soporte</a>
  `;
    const html = obtenerPlantillaHtml(contenidoInterno);
    await this.sendEmail(
      user.email,
      subject,
      `Adhesión cancelada para ${proyecto.nombre_proyecto}`,
      html,
    );
  },
};

module.exports = emailService;
