const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config();

// Configura el transportador de correo utilizando las credenciales de entorno.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
function obtenerPlantillaHtml(contenidoPrincipalHtml) {
  // ⚠️ URLs de imágenes de ejemplo. DEBES REEMPLAZARLAS.
  const LOGO_URL =
    "https://res.cloudinary.com/dj7kcgf2z/image/upload/v1762267998/LoteplanLogo_dxbyo5.jpg";
  const FONDO_HEADER_FOOTER = "#be7720ff"; // Azul oscuro
  const COLOR_ACCION = "#FF5733"; // Naranja de acción

  return `
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f6f6f6;">
        <tr>
          <td align="center">
            <table class="content-table" width="600" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse; max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              <tr>
                <td align="center" style="padding: 20px 0; background-color: #ffffff; border-bottom: 2px solid #eeeeee;">
                  <img src="${LOGO_URL}" alt="Logo Loteplan.com" width="200" style="display: block; border: 0;" />
                </td>
              </tr>
              <tr>
                <td style="padding: 30px 40px; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333333;">
                  ${contenidoPrincipalHtml}
                </td>
              </tr>
              <tr>
                <td align="center" style="background-color: ${FONDO_HEADER_FOOTER}; padding: 30px 40px 20px;">
                  <div style="text-align: center; margin-bottom: 20px;">
                  </div>
                  <p style="margin: 0; color: #ffffff; font-size: 14px; font-family: Arial, sans-serif;">
                    <a href="https://res.cloudinary.com/dj7kcgf2z/image/upload/v1762267998/LoteplanLogo_dxbyo5.jpg" style="color: #ffffff; text-decoration: none;">© ${new Date().getFullYear()} Loteplan.com</a>
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
 * Servicio para el envío de correos electrónicos a través de Nodemailer.
 * Incluye funciones específicas para notificaciones clave de la aplicación.
 */
const emailService = {
  /**
   * @async
   * @function sendEmail
   * @description Función base para enviar un correo electrónico.
   * @param {string} to - Dirección de correo del destinatario.
   * @param {string} subject - Asunto del correo.
   * @param {string} text - Cuerpo del correo en texto plano.
   * @param {string} html - Cuerpo del correo en formato HTML.
   */
  async sendEmail(to, subject, text, html) {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
      html,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Correo enviado a ${to}`);
    } catch (error) {
      console.error(`Error al enviar correo a ${to}:`, error);
    }
  }, // <-- COMA

  /**
   * @async
   * @function notificarInicioSubasta
   * @description Envía un correo de notificación de inicio de subasta, indicando si es pública o privada.
   * @param {string} email - Correo del destinatario.
   * @param {object} lote - Instancia del lote que se está activando (debe contener id, nombre_lote, monto_base_lote, fecha_fin).
   * @param {boolean} esSubastaPrivada - Indica si la subasta es exclusiva para suscriptores.
   */
  async notificarInicioSubasta(email, lote, esSubastaPrivada) {
    const tipoSubasta = esSubastaPrivada ? "Privada" : "Pública";
    const subject = `¡NUEVO LOTE EN SUBASTA (${tipoSubasta})! Lote #${lote.id}`;
    const mensajeExclusividad = esSubastaPrivada
      ? `**IMPORTANTE: Esta es una subasta privada y solo los suscriptores del proyecto asociado (ID: ${
          lote.id_proyecto || "N/A"
        }) pueden participar.**`
      : `¡No te lo pierdas!`;

    // Contenido interno específico para la plantilla
    const contenidoInterno = `
        <h2 style="color: #0b1b36; margin-top: 0;">¡Subasta Activa! Lote: ${
          lote.nombre_lote
        }</h2>
        <p>El lote **"${
          lote.nombre_lote
        }"** ya está disponible para pujar en nuestra plataforma.</p>
        <h3 style="color: #333;">Detalles de la Subasta</h3>
        <ul style="list-style: none; padding-left: 0; line-height: 2;">
            <li><strong style="color: #555;">Monto Base:</strong> $${
              lote.monto_base_lote
            }</li>
            <li><strong style="color: #555;">ID del Lote:</strong> ${
              lote.id
            }</li>
            <li><strong style="color: #FF5733;">Fecha de Cierre Estimada:</strong> ${
              lote.fecha_fin
                ? lote.fecha_fin.toLocaleDateString("es-ES")
                : "N/A"
            }</li>
        </ul>
        <p style="font-weight: bold; color: ${
          esSubastaPrivada ? "red" : "#333"
        }">${mensajeExclusividad}</p>
        <a href="[URL_A_LA_SUBASTA]" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #0b1b36; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
            Ver Lote Ahora
        </a>
    `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    const text = `Subasta activa: Lote ${lote.nombre_lote}. Monto Base: $${
      lote.monto_base_lote
    }. ${esSubastaPrivada ? "Subasta Privada." : "Subasta Pública."}`;

    await this.sendEmail(email, subject, text, html);
  }, // <-- COMA

  /**
   * @async
   * @function sendConfirmationEmail
   * @description Envía el correo electrónico de confirmación de cuenta con un enlace.
   * @param {object} user - Objeto del usuario (debe contener nombre y email).
   * @param {string} token - Token de confirmación.
   */
  async sendConfirmationEmail(user, token) {
    // ⚠️ La URL base DEBE ser la del frontend que procesa la confirmación.
    const confirmationLink = `${process.env.FRONTEND_URL}/api/auth/confirmar_email/${token}`;
    const subject = "¡Bienvenido! Confirma tu Cuenta de Usuario";

    // Contenido interno específico para la plantilla
    const contenidoInterno = `
        <h2 style="color: #0b1b36; margin-top: 0;">Hola ${user.nombre},</h2>
        <p>Gracias por registrarte en Loteplan. Por favor, haz clic para confirmar tu correo y activar tu cuenta:</p>
        <a href="${confirmationLink}" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #FF5733; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
            Confirmar mi Correo Electrónico
        </a>
        <p style="margin-top: 30px;">Si no puedes hacer clic en el botón, copia y pega esta URL en tu navegador:</p>
        <small style="word-break: break-all; color: #808080;">${confirmationLink}</small>
    `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      user.email,
      subject,
      `Confirma tu cuenta en ${confirmationLink}`,
      html
    );
  }, // <-- COMA

  /**
   * @async
   * @function notificarGanadorPuja
   * @description Notifica al usuario que ha ganado un lote, indicando el plazo de 90 días para el pago.
   * @param {object} user - Objeto del nuevo ganador.
   * @param {number} loteId - ID del lote ganado.
   * @param {string} fechaLimite - Fecha límite de pago (formateada).
   * @param {boolean} [esReasignacion=false] - Indica si la victoria es por un incumplimiento anterior.
   */
  async notificarGanadorPuja(
    user,
    loteId,
    fechaLimite,
    esReasignacion = false
  ) {
    const subject = `¡Felicidades! Ganaste el Lote #${loteId}`;

    const titulo = esReasignacion
      ? `Tu puja ha sido la ganadora. El Lote **#${loteId}** te ha sido **reasignado**.`
      : `Tu puja ha sido la ganadora del Lote **#${loteId}**.`;

    // Contenido interno específico para la plantilla
    const contenidoInterno = `
        <h2 style="color: #4CAF50; margin-top: 0;">¡Felicidades, ${
          user.nombre
        }!</h2>
        <p>${titulo}</p>
        ${
          esReasignacion
            ? '<p style="color: red; font-weight: bold;">Esto ocurre debido al incumplimiento de pago del postor anterior.</p>'
            : ""
        }
        <h3 style="color: #333;">Detalles y Plazo de Pago</h3>
        <p>Tienes **90 días** para completar el pago.</p>
        <p style="font-size: 1.1em; font-weight: bold; color: #FF5733;">La fecha límite de pago es: **${fechaLimite}**.</p>
        <p>Visita tu perfil para gestionar el pago.</p>
        <a href="[URL_A_TU_PERFIL_PAGOS]" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
            Gestionar Pago
        </a>
    `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      user.email,
      subject,
      `Ganaste el Lote #${loteId}. Fecha límite de pago: ${fechaLimite}`,
      html
    );
  }, // <-- COMA

  /**
   * @async
   * @function notificarImpago
   * @description Notifica al usuario que ha perdido un lote por no cumplir con el plazo de pago,
   * e informa sobre la devolución de su token.
   * @param {object} user - Objeto del usuario incumplidor.
   * @param {number} loteId - ID del lote perdido.
   */
  async notificarImpago(user, loteId) {
    const subject = `Importante: Lote #${loteId} Perdido por Impago`;

    // Contenido interno específico para la plantilla
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
      html
    );
  }, // <-- COMA

  // -----------------------------------------------------------
  // FUNCIONES DE NOTIFICACIÓN ESPECÍFICAS DE PROYECTO
  // -----------------------------------------------------------

  /**
   * @async
   * @function notificarInicioProyectoMasivo (A MÚLTIPLES USUARIOS)
   * @description Envía un email a todos los usuarios informando que el proyecto alcanzó su objetivo y ha comenzado.
   * @param {object} proyecto - Instancia del proyecto de Sequelize.
   * @param {object[]} usuarios - Lista de objetos Usuario a notificar (debe contener nombre y email).
   * @returns {Promise<void>}
   */
  async notificarInicioProyectoMasivo(proyecto, usuarios) {
    const subject = `🥳 ¡Objetivo Alcanzado! El proyecto ${proyecto.nombre_proyecto} ha comenzado.`;

    for (const usuario of usuarios) {
      if (usuario.email) {
        // Contenido interno específico para la plantilla
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
  }, // <-- COMA

  /**
   * @async
   * @function notificarInicioProyectoAdmin (A UN ADMINISTRADOR) 🆕
   * @description Notifica a un administrador que un proyecto alcanzó su objetivo y ha comenzado.
   * @param {string} adminEmail - Correo del administrador.
   * @param {object} proyecto - Instancia del proyecto de Sequelize.
   */
  async notificarInicioProyectoAdmin(adminEmail, proyecto) {
    const subject = `🟢 INICIO DE PROYECTO: Objetivo Cumplido - ${proyecto.nombre_proyecto}`;

    // Contenido interno específico para la plantilla
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
      html
    );
  }, // <-- COMA

  /**
   * @async
   * @function notificarPausaProyecto (A USUARIOS)
   * @description Envía un correo a un suscriptor notificando la pausa de un proyecto mensual
   * debido a la caída de suscripciones por debajo del mínimo.
   * @param {object} user - Objeto del usuario/suscriptor (debe contener nombre y email).
   * @param {object} proyecto - Objeto del proyecto.
   */
  async notificarPausaProyecto(user, proyecto) {
    const subject = `🚨 ¡Importante! Proyecto ${proyecto.nombre_proyecto} PAUSADO`;
    const text = `El proyecto ${proyecto.nombre_proyecto} ha sido PAUSADO temporalmente. Razón: Las suscripciones activas (${proyecto.suscripciones_actuales}) han caído por debajo del mínimo requerido (${proyecto.suscripciones_minimas}). Se reanudará cuando se alcance el objetivo de ${proyecto.obj_suscripciones}.`;

    // Contenido interno específico para la plantilla
    const contenidoInterno = `
        <h2 style="color: #ffc107; margin-top: 0;">¡Tu Proyecto ha sido Pausado Temporalmente!</h2>
        <p>Hola **${user.nombre}**, lamentamos informarte que el proyecto **"${proyecto.nombre_proyecto}"** ha sido **PAUSADO** temporalmente.</p>
        <p>Razón: El número de **suscripciones activas** (${proyecto.suscripciones_actuales}) ha caído por debajo del mínimo requerido (${proyecto.suscripciones_minimas}).</p>
        <p style="font-weight: bold; color: #d9534f; font-size: 1.1em;">Consecuencia: Dejaremos de generar pagos mensuales y de descontar meses del plazo.</p>
        <p>Te notificaremos tan pronto como se reanude. </p>
    `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(user.email, subject, text, html);
  }, // <-- COMA

  /**
   * @async
   * @function notificarReversionAdmin (A ADMINISTRADORES)
   * @description Notifica a un administrador que un proyecto se revirtió a 'En Espera' por bajo umbral.
   * @param {object} adminEmail - Correo del admin.
   * @param {object} proyecto - Objeto del proyecto.
   */
  async notificarReversionAdmin(adminEmail, proyecto) {
    const subject = `🛑 ALERTA CRÍTICA: Proyecto Revertido - ${proyecto.nombre_proyecto}`;

    // Contenido interno específico para la plantilla
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
      html
    );
  }, // <-- COMA

  /**
   * @async
   * @function notificarFinalizacionAdmin (A ADMINISTRADORES)
   * @description Notifica a un administrador que un proyecto ha completado su plazo.
   * @param {string} adminEmail - Dirección de correo del destinatario (jefe/admin).
   * @param {object} proyecto - Objeto del proyecto que ha finalizado.
   */
  async notificarFinalizacionAdmin(adminEmail, proyecto) {
    const subject = `✅ PROYECTO FINALIZADO - Acción: ${proyecto.nombre_proyecto}`;

    // Contenido interno específico para la plantilla
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
      html
    );
  }, // <-- COMA

  /**
   * @async
   * @function notificarPagoGenerado
   * @description Notifica al usuario que se ha generado su pago mensual.
   * @param {object} user - Objeto del usuario (debe contener nombre y email).
   * @param {object} proyecto - Objeto del proyecto (debe contener nombre_proyecto).
   * @param {number} cuota - Número de la cuota (mes) generada.
   * @param {number} monto - Monto del pago.
   * @param {string} fechaVencimiento - Fecha límite de pago (formato YYYY-MM-DD).
   */
  async notificarPagoGenerado(user, proyecto, cuota, monto, fechaVencimiento) {
    const subject = `Recordatorio de Pago: ${proyecto.nombre_proyecto} - Cuota ${cuota}`;

    // Contenido interno específico para la plantilla
    const contenidoInterno = `
        <h2 style="color: #0b1b36; margin-top: 0;">¡Tu Pago Mensual ha sido Generado!</h2>
        <p>Hola **${user.nombre}**:</p>
        <p>Tu cuota **#${cuota}** para el proyecto **"${
      proyecto.nombre_proyecto
    }"** ha sido generada.</p>
        <h3 style="color: #333;">Detalles del Pago</h3>
        <ul style="list-style: none; padding-left: 0; line-height: 2;">
            <li><strong style="color: #555;">Monto a pagar:</strong> <strong style="color: #4CAF50;">$${monto.toFixed(
              2
            )}</strong></li>
            <li><strong style="color: #555;">Cuota Nro:</strong> ${cuota}</li>
            <li><strong style="color: #555;">Proyecto:</strong> ${
              proyecto.nombre_proyecto
            }</li>
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
      `Se ha generado tu pago de $${monto.toFixed(2)} para el proyecto ${
        proyecto.nombre_proyecto
      }. Vence el ${fechaVencimiento}.`,
      html
    );
  }, // <-- COMA

  /**
   * @async
   * @function sendPasswordResetEmail
   * @description Envía un correo con el enlace para restablecer la contraseña.
   * @param {object} user - Objeto del usuario (debe contener nombre y email).
   * @param {string} token - Token de restablecimiento.
   */
  async sendPasswordResetEmail(user, token) {
    // ⚠️ La URL base DEBE ser la del frontend que procesa el token de reset.
    // MODIFICADO: Uso de process.env.FRONTEND_URL
    const resetLink = `${process.env.FRONTEND_URL}/restablecer_contrasena?token=${token}`;
    const subject = "Solicitud de Restablecimiento de Contraseña";

    // Contenido interno específico para la plantilla
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
      html
    );
  },

  /**
   * @async
   * @function notificarPagoVencidoAdmin
   * @description Notifica al administrador sobre un pago vencido de un usuario específico.
   * @param {string} adminEmail - Correo del administrador.
   * @param {object} user - Objeto del usuario incumplidor (para mostrar quién es).
   * @param {object} proyecto - Objeto del proyecto asociado.
   * @param {object} pago - Objeto del pago vencido.
   * @param {number} montoBase - Monto base del pago.
   * @param {number} recargoTotal - Recargo aplicado.
   */
  async notificarPagoVencidoAdmin(
    adminEmail,
    user,
    proyecto,
    pago,
    montoBase,
    recargoTotal
  ) {
    const subject = `⚠️ PAGO VENCIDO: Acción Requerida - Usuario ${user.nombre}`;

    // Contenido interno específico para la plantilla
    const contenidoInterno = `
        <h2 style="color: #d9534f; margin-top: 0;">¡ALERTA DE PAGO VENCIDO!</h2>
        <p>El usuario **${user.nombre}** (Email: ${
      user.email
    }) ha incumplido el pago de la cuota **#${pago.mes}** para el proyecto **"${
      proyecto.nombre_proyecto
    }"**.</p>
        <h3 style="color: #333;">Detalles</h3>
        <ul style="list-style: none; padding-left: 0; line-height: 2;">
            <li><strong style="color: #555;">ID Pago:</strong> ${pago.id}</li>
            <li><strong style="color: #555;">Monto Base:</strong> $${montoBase.toFixed(
              2
            )}</li>
            <li><strong style="color: #d9534f;">Monto con Recargo:</strong> $${pago.monto.toFixed(
              2
            )} (Recargo: $${recargoTotal.toFixed(2)})</li>
            <li><strong style="color: #555;">Fecha Vencimiento:</strong> ${
              pago.fecha_vencimiento
            }</li>
        </ul>
        <p style="font-weight: bold;">Se ha enviado una alerta al cliente. Por favor, realice el seguimiento correspondiente.</p>
    `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      adminEmail,
      subject,
      `Pago vencido del usuario ${user.nombre} para el proyecto ${proyecto.nombre_proyecto}.`,
      html
    );
  },
  /**
   * @async
   * @function notificarReembolsoUsuario
   * @description Notifica al usuario sobre un reembolso automático por fallo de negocio.
   * @param {object} user - Objeto del usuario (debe contener nombre y email).
   * @param {object} transaccion - Objeto de la transacción (debe contener id, monto, tipo_transaccion).
   * @param {string} motivoFallo - Mensaje de error de la lógica de negocio.
   */
  /**
   * @async
   * @function notificarReembolsoUsuario
   * @description Notifica al usuario que su transacción falló y le informa sobre el estado del reembolso.
   * @param {object} user - Objeto del usuario (debe contener nombre y email).
   * @param {object} transaccion - Objeto de la transacción (debe contener monto, tipo_transaccion, id).
   * @param {string} motivoFallo - Razón del fallo de la lógica de negocio (e.g., "no hay cupos").
   * @param {boolean} reembolsoExitoso - Indica si el intento de reembolso en MP fue exitoso (NUEVO).
   */
  /**
   * @async
   * @function notificarReembolsoUsuario
   * @description Notifica al usuario con un tono profesional y calmado que su transacción falló, informando el estado del reembolso.
   * @param {object} user - Objeto del usuario (debe contener nombre y email).
   * @param {object} transaccion - Objeto de la transacción (debe contener monto, tipo_transaccion, id).
   * @param {string} motivoFallo - Razón del fallo de la lógica de negocio (e.g., "no hay cupos").
   * @param {boolean} reembolsoExitoso - Indica si el intento de reembolso en MP fue exitoso.
   */
  async notificarReembolsoUsuario(
    user,
    transaccion,
    motivoFallo,
    reembolsoExitoso
  ) {
    if (!user || !user.email) return;

    const monto = parseFloat(transaccion.monto).toFixed(2);
    // Determinar el tipo de acción que falló para un mensaje más natural
    const tipoAccion = transaccion.tipo_transaccion.includes("suscripcion")
      ? "la suscripción"
      : "la inversión";

    let userSubject;
    let tituloPrincipal;
    let mensajeAccion;
    let colorTitulo;
    let mensajeAgradecimiento;

    if (reembolsoExitoso) {
      // --- Escenario 1: Reembolso Automático EXITOSO (Mensaje tranquilizador) ---
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
      // --- Escenario 2: Reembolso Automático FALLIDO (Mensaje de acción simple) ---
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

    // --- Estructura Final del Contenido ---
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
      userHtml
    );
  },

  /**
   * @async
   * @function notificarPagoVencidoCliente
   * @description Notifica al usuario sobre su pago vencido, incluyendo el recargo aplicado.
   * @param {object} usuario - Objeto del usuario (debe contener nombre y email).
   * @param {object} proyecto - Objeto del proyecto asociado (debe contener nombre_proyecto).
   * @param {object} pago - Objeto del pago vencido (debe contener id, mes, monto, fecha_vencimiento).
   * @param {number} montoBase - Monto original del pago sin recargos.
   * @param {number} recargoTotal - Recargo aplicado.
   */
  async notificarPagoVencidoCliente(
    usuario,
    proyecto,
    pago,
    montoBase,
    recargoTotal
  ) {
    if (!usuario || !usuario.email) return;

    const subject = `🚨 ALERTA: ¡Tu pago para "${proyecto.nombre_proyecto}" ha VENCIDO!`;
    const montoBaseTexto = montoBase.toFixed(2);
    const montoActualTexto = pago.monto.toFixed(2);
    const recargoTotalTexto = recargoTotal.toFixed(2);

    // --- Contenido para el Cliente (dentro de la plantilla) ---
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
      html
    );
  }, // <-- COMA

  /**
   * @async
   * @function notificarRecordatorioPago
   * @description Envía un recordatorio al usuario de que su pago está próximo a vencer.
   * @param {object} usuario - Objeto del usuario (debe contener nombre y email).
   * @param {object} proyecto - Objeto del proyecto asociado (debe contener nombre_proyecto).
   * @param {object} pago - Objeto del pago (debe contener id, mes, monto, fecha_vencimiento).
   * @param {string} email_empresa - Email de la empresa para enviar una copia (opcional/log).
   */
  async notificarRecordatorioPago(usuario, proyecto, pago, email_empresa) {
    if (!usuario || !usuario.email) return;

    const subject = `🔔 Recordatorio: Tu pago para "${proyecto.nombre_proyecto}" está por vencer`;
    const montoCuota = pago.monto.toFixed(2);
    const fechaVencimiento = new Date(
      pago.fecha_vencimiento
    ).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // --- Contenido para el Cliente (dentro de la plantilla) ---
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
      html
    );
  },

  /**
   * @async
   * @function notificarReembolsoAdmin (VERSIÓN MEJORADA)
   * @description Notifica a un administrador sobre un reembolso automático CON DETALLES DEL RESULTADO
   * @param {string} adminEmail - Correo del administrador.
   * @param {object} user - Objeto del usuario (nombre, email, id).
   * @param {object} transaccion - Objeto de la transacción (id, monto, tipo_transaccion).
   * @param {string} motivoFallo - Mensaje de error de la lógica de negocio.
   * @param {object} detallesReembolso - Objeto con {reembolsoExitoso, errorReembolso, idPagoMP}
   */
  async notificarReembolsoAdminMejorada(
    adminEmail,
    user,
    transaccion,
    motivoFallo,
    detallesReembolso = {}
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

    // Color y mensaje según el resultado
    const colorTitulo = reembolsoExitoso ? "#4CAF50" : "#d9534f";
    const estadoReembolso = reembolsoExitoso
      ? `<p style="color: #4CAF50; font-weight: bold; border-left: 3px solid #4CAF50; padding-left: 10px;">✅ El reembolso fue procesado exitosamente por Mercado Pago.</p>`
      : `<p style="color: #d9534f; font-weight: bold; border-left: 3px solid #d9534f; padding-left: 10px;">⚠️ EL REEMBOLSO FALLÓ. Debes realizarlo MANUALMENTE.</p>
                <p style="background-color: #fff3cd; padding: 10px; border-left: 3px solid #ffc107; font-size: 0.9em;">
                    <strong>Error del API:</strong> ${
                      errorReembolso || "Sin detalles del error"
                    }
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

    // --- Contenido para el Administrador (dentro de la plantilla) ---
    const contenidoInterno = `
            <h2 style="color: ${colorTitulo}; margin-top: 0;">${
      reembolsoExitoso ? "✅ Reembolso Procesado" : "🚨 ALERTA CRÍTICA"
    }</h2>
            <p>El pago de <strong>$${monto}</strong> del usuario <strong>${
      user.nombre
    }</strong> (ID: ${user.id}, Email: ${
      user.email
    }) fue aprobado por MP, pero el sistema no pudo procesar la lógica de negocio (${tipoTransaccion}).</p>

            <h3 style="color: #0b1b36;">📋 Detalles del Fallo y Transacción</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 0.95em;">
                <tr style="background-color: #f8f9fa;">
                    <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Transacción ID:</strong></td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${
                      transaccion.id
                    }</td>
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
      `Reembolso ${
        reembolsoExitoso ? "exitoso" : "FALLIDO - Acción requerida"
      } para Transacción #${transaccion.id} del usuario ${
        user.email
      }. Motivo: ${motivoFallo}`,
      adminHtml
    );
  },
  /**
   * @async
   * @function notificarSuscripcionExitosa
   * @description Confirma al usuario que su suscripción al proyecto se ha completado con éxito tras el pago.
   * @param {string} userEmail - Correo del usuario.
   * @param {object} proyecto - Objeto del proyecto asociado (debe contener nombre_proyecto, monto_suscripcion, plazo_inversion).
   */
  async notificarSuscripcionExitosa(userEmail, proyecto) {
    if (!userEmail) return;

    const subject = `✅ ¡Suscripción Exitosa! Bienvenido a "${proyecto.nombre_proyecto}"`;
    const montoCuota = parseFloat(proyecto.monto_suscripcion || 0).toFixed(2);

    // --- Contenido para el Usuario ---
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
      html
    );
  }, // <-- COMA

  /**
   * @async
   * @function notificarInicioProyectoMasivo
   * @description Notifica a todos los usuarios que un proyecto ha alcanzado su objetivo y ha iniciado oficialmente.
   * @param {object} proyecto - Objeto del proyecto (debe contener nombre_proyecto, obj_suscripciones).
   * @param {Array<object>} usuarios - Array de objetos de usuario (debe contener nombre y email).
   */
  async notificarInicioProyectoMasivo(proyecto, usuarios) {
    if (!usuarios || usuarios.length === 0) return;

    const subject = `🚀 ¡GRAN NOTICIA! "${proyecto.nombre_proyecto}" ha iniciado oficialmente`;
    const totalSuscritos = proyecto.obj_suscripciones || "el objetivo";
    const emailTo = usuarios.map((u) => u.email).join(",");

    // NOTA: Es común enviar un email por cada usuario en lugar de un masivo BCC para personalizar el saludo.
    // Aquí asumimos un envío masivo para simplificar el ejemplo, pero usamos el saludo genérico.

    // --- Contenido para los Usuarios ---
    const contenidoInterno = `
        <h2 style="color: #FF5733; margin-top: 0;">¡Objetivo de Suscripción Alcanzado!</h2>
        <p>A toda nuestra comunidad de inversores:</p>
        <p>Tenemos el placer de anunciar que el proyecto **"${proyecto.nombre_proyecto}"** ha alcanzado su objetivo de **${totalSuscritos} suscriptores** y ha pasado oficialmente al estado **"En Proceso"**.</p>
        
        <div style="border: 1px solid #0b1b36; padding: 15px; background-color: #f7f9fc; margin-top: 20px;">
            <p style="font-weight: bold; color: #0b1b36;">Próximos Pasos:</p>
            <ul style="line-height: 1.6;">
                <li>Tu plan de pagos comenzará a correr a partir de esta fecha.</li>
                <li>Podrás seguir el progreso del proyecto en tu panel de control.</li>
            </ul>
        </div>

        <p style="margin-top: 20px;">Gracias por tu confianza. ¡Empezamos a trabajar en tu próxima inversión!</p>
        <a href="[URL_A_PROYECTO_EN_SITIO]" style="display: inline-block; padding: 12px 25px; margin: 25px 0; background-color: #FF5733; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
            Ver Detalles del Proyecto
        </a>
    `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    // Esta implementación requerirá un método sendEmail que soporte múltiples destinatarios
    // (BCC o enviando un email individual por usuario dentro de un bucle en el servicio llamador, como se sugirió).
    // Aquí se asume que se usa el bucle del servicio que lo llama.
    for (const usuario of usuarios) {
      await this.sendEmail(
        usuario.email,
        subject,
        `El proyecto ${proyecto.nombre_proyecto} ha iniciado.`,
        html
      );
    }
  }, // <-- COMA

  /**
   * @async
   * @function notificarInicioProyectoAdmin
   * @description Notifica al administrador que un proyecto ha alcanzado su objetivo y ha iniciado.
   * @param {string} adminEmail - Correo del administrador.
   * @param {object} proyecto - Objeto del proyecto asociado (debe contener nombre_proyecto, obj_suscripciones, id).
   */
  async notificarInicioProyectoAdmin(adminEmail, proyecto) {
    if (!adminEmail) return;

    const adminSubject = `✅ PROYECTO INICIADO: Objetivo alcanzado para #${proyecto.id} - ${proyecto.nombre_proyecto}`;
    const totalSuscritos = proyecto.obj_suscripciones || "el objetivo";

    // --- Contenido para el Administrador ---
    const contenidoInterno = `
        <h2 style="color: #4CAF50; margin-top: 0;">¡PROYECTO INICIADO AUTOMÁTICAMENTE!</h2>
        <p>El proyecto **"${
          proyecto.nombre_proyecto
        }"** ha alcanzado el número de suscripciones requerido (**${totalSuscritos}**) y ha sido marcado como **"En Proceso"**.</p>
        
        <h3 style="color: #0b1b36;">Acciones Realizadas</h3>
        <ul style="list-style-type: square; padding-left: 20px; line-height: 1.8;">
            <li>El estado del proyecto fue actualizado a **"En proceso"**.</li>
            <li>Se estableció la fecha de inicio del proceso: **${new Date().toLocaleDateString(
              "es-ES"
            )}**.</li>
            <li>Se envió notificación masiva por email a todos los usuarios.</li>
            <li>El contador de meses restantes ha sido inicializado.</li>
        </ul>

        <p style="font-weight: bold; color: #d9534f; margin-top: 20px;">🚨 ACCIÓN REQUERIDA (Opcional):</p>
        <p>Verificar en el panel de administración que el cron job de generación de cuotas mensuales se haya activado correctamente, o activarlo manualmente si es necesario.</p>

        <a href="[URL_A_PANEL_ADMIN]" style="display: inline-block; padding: 10px 20px; margin: 15px 0; background-color: #FF5733; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Ver Proyecto #${proyecto.id}
        </a>
    `;

    const html = obtenerPlantillaHtml(contenidoInterno);

    await this.sendEmail(
      adminEmail,
      adminSubject,
      `Proyecto #${proyecto.id} (${proyecto.nombre_proyecto}) ha iniciado.`,
      html
    );
  },
  /**
   * @async
   * @function notificarPagoRecibido
   * @description Notifica al usuario que su pago mensual ha sido procesado exitosamente.
   * @param {object} usuario - Objeto del usuario (debe contener nombre y email).
   * @param {object} proyecto - Objeto del proyecto (debe contener nombre_proyecto).
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
    <p>Te confirmamos que hemos recibido tu pago de <strong style="color: #4CAF50;">$${montoTexto}</strong> correspondiente a la <strong>cuota #${mesPago}</strong> del proyecto <strong>"${
      proyecto.nombre_proyecto
    }"</strong>.</p>
    
    <div style="border: 1px solid #4CAF50; padding: 15px; background-color: #e6ffe6; margin: 20px 0;">
      <p style="margin: 0; font-weight: bold; color: #4CAF50;">✅ Tu inversión está al día</p>
    </div>

    <h3 style="color: #0b1b36;">Detalles del Pago</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px;">
      <tr>
        <td style="padding: 10px; border: 1px solid #dee2e6; background-color: #f8f9fa;"><strong>Proyecto:</strong></td>
        <td style="padding: 10px; border: 1px solid #dee2e6;">${
          proyecto.nombre_proyecto
        }</td>
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
        <td style="padding: 10px; border: 1px solid #dee2e6;">${new Date().toLocaleDateString(
          "es-ES"
        )}</td>
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
      html
    );
  },
};
module.exports = emailService;
