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
   */ async notificarInicioSubasta(email, lote, esSubastaPrivada) {
    const tipoSubasta = esSubastaPrivada ? "Privada" : "Pública";
    const subject = `¡NUEVO LOTE EN SUBASTA (${tipoSubasta})! Lote #${lote.id}`;
    const mensajeExclusividad = esSubastaPrivada
      ? `**IMPORTANTE: Esta es una subasta privada y solo los suscriptores del proyecto asociado (ID: ${
          lote.id_proyecto || "N/A"
        }) pueden participar.**`
      : `¡No te lo pierdas!`;

    const html = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #007bff; border-left: 5px solid #007bff;">
                <h2 style="color: #007bff;">¡Subasta Activa! Lote: ${
      lote.nombre_lote
    }</h2>
                <p>El lote **"${
      lote.nombre_lote
    }"** ya está disponible para pujar en nuestra plataforma.</p>
                <h3 style="color: #333;">Detalles de la Subasta</h3>
                <ul style="list-style: none; padding-left: 0;">
                    <li><strong style="color: #555;">Monto Base:</strong> $${
      lote.monto_base_lote
    }</li>
                    <li><strong style="color: #555;">ID del Lote:</strong> ${
      lote.id
    }</li>
                    <li><strong style="color: #d9534f;">Fecha de Cierre Estimada:</strong> ${
      lote.fecha_fin ? lote.fecha_fin.toLocaleDateString("es-ES") : "N/A"
    }</li>
                </ul>
                <p style="font-weight: bold; color: ${
      esSubastaPrivada ? "red" : "#333"
    }">${mensajeExclusividad}</p>
            </div>
        `;

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
   */ async sendConfirmationEmail(user, token) {
    // ⚠️ La URL base DEBE ser la del frontend que procesa la confirmación.
    const confirmationLink = `${process.env.FRONTEND_URL}/api/auth/confirmar_email/${token}`;
    const subject = "¡Bienvenido! Confirma tu Cuenta de Usuario";

    const html = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd;">
                <h2>Hola ${user.nombre},</h2>
                <p>Gracias por registrarte. Por favor, haz clic para confirmar tu correo y activar tu cuenta:</p>
                <a href="${confirmationLink}" style="display: inline-block; padding: 10px 20px; margin: 15px 0; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">
                    Confirmar mi Correo Electrónico
                </a>
                <p>Este enlace expirará pronto. Si no puedes hacer clic, copia y pega esta URL:</p>
                <small>${confirmationLink}</small>
            </div>
        `;

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
   */ async notificarGanadorPuja(
    user,
    loteId,
    fechaLimite,
    esReasignacion = false
  ) {
    const subject = `¡Felicidades! Ganaste el Lote #${loteId}`;

    const titulo = esReasignacion
      ? `Tu puja ha sido la ganadora. El Lote **#${loteId}** te ha sido **reasignado**.`
      : `Tu puja ha sido la ganadora (o reasignada) del Lote **#${loteId}**.`;

    const html = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #4CAF50;">
                <h2>Estimado ${user.nombre},</h2>
                <p>${titulo}</p>
                ${
      esReasignacion
        ? '<p style="color: red; font-weight: bold;">Esto ocurre debido al incumplimiento de pago del postor anterior.</p>'
        : ""
    }
                <p>Tienes **90 días** para completar el pago.</p>
                <p>La fecha límite de pago es: **${fechaLimite}**.</p>
                <p>Visita tu perfil para gestionar el pago.</p>
            </div>
        `;

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
   */ async notificarImpago(user, loteId) {
    const subject = `Importante: Lote #${loteId} Perdido por Impago`;
    const html = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #f44336;">
                <h2>Estimado ${user.nombre},</h2>
                <p>Lamentamos informarte que has **perdido el Lote #${loteId}** debido a que el plazo de 90 días para realizar el pago ha expirado.</p>
                <p style="font-weight: bold;">Tu token de subasta ha sido devuelto a tu cuenta.</p>
                <p>El lote ha sido reasignado al siguiente postor.</p>
            </div>
        `;

    await this.sendEmail(
      user.email,
      subject,
      `Lote #${loteId} perdido por impago. Token devuelto.`,
      html
    );
  }, // <-- COMA // ----------------------------------------------------------- // FUNCIONES DE NOTIFICACIÓN ESPECÍFICAS DE PROYECTO // -----------------------------------------------------------
  /**
   * @async
   * @function notificarInicioProyectoMasivo (A MÚLTIPLES USUARIOS)
   * @description Envía un email a todos los usuarios informando que el proyecto alcanzó su objetivo y ha comenzado.
   * @param {object} proyecto - Instancia del proyecto de Sequelize.
   * @param {object[]} usuarios - Lista de objetos Usuario a notificar (debe contener nombre y email).
   * @returns {Promise<void>}
   */ async notificarInicioProyectoMasivo(proyecto, usuarios) {
    const subject = `🥳 ¡Objetivo Alcanzado! El proyecto ${proyecto.nombre_proyecto} ha comenzado.`;

    for (const usuario of usuarios) {
      if (usuario.email) {
        const html = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #4CAF50; border-left: 5px solid #4CAF50;">
                <h2 style="color: #4CAF50;">¡Gran Noticia, ${usuario.nombre}!</h2>
                <p>El proyecto **"${proyecto.nombre_proyecto}"** ha alcanzado el **objetivo de ${proyecto.obj_suscripciones} suscripciones**.</p>
                <p style="font-weight: bold;">¡El proceso de inversión ha comenzado!</p>
                <ul>
                    <li>La generación de tu **pago mensual** comenzará el día **1** del próximo mes.</li>
                    <li>El plazo de pago vencerá el día **10** de cada mes.</li>
                </ul>
                <p>Agradecemos tu apoyo. Juntos hacemos realidad este proyecto.</p>
            </div>
        `;
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
   */ async notificarInicioProyectoAdmin(adminEmail, proyecto) {
    const subject = `🟢 INICIO DE PROYECTO: Objetivo Cumplido - ${proyecto.nombre_proyecto}`;

    const html = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #007bff; border-left: 5px solid #007bff;">
                <h2 style="color: #007bff;">¡El Proyecto ha Iniciado su Proceso!</h2>
                <p>El proyecto **"${proyecto.nombre_proyecto}"** (ID: ${proyecto.id}) ha alcanzado el número de suscripciones requerido (**${proyecto.obj_suscripciones}**).</p>
                <p style="font-weight: bold;">Estado Actual: En proceso</p>
                <p>El sistema ha marcado la fecha de inicio del proceso y comenzará la generación de pagos mensuales.</p>
                <p>No se requiere acción inmediata, pero por favor, confirme el estado en el panel de administración.</p>
            </div>
        `;

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
   */ async notificarPausaProyecto(user, proyecto) {
    const subject = `🚨 ¡Importante! Proyecto ${proyecto.nombre_proyecto} PAUSADO`;
    const text = `El proyecto ${proyecto.nombre_proyecto} ha sido PAUSADO temporalmente. Razón: Las suscripciones activas (${proyecto.suscripciones_actuales}) han caído por debajo del mínimo requerido (${proyecto.suscripciones_minimas}). Se reanudará cuando se alcance el objetivo de ${proyecto.obj_suscripciones}.`;

    const html = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ffc107; border-left: 5px solid #ffc107;">
                <h2 style="color: #ffc107;">¡Tu Proyecto ha sido Pausado Temporalmente!</h2>
                <p>Hola **${user.nombre}**, lamentamos informarte que el proyecto **"${proyecto.nombre_proyecto}"** ha sido **PAUSADO** temporalmente.</p>
                <p>Razón: El número de **suscripciones activas** (${proyecto.suscripciones_actuales}) ha caído por debajo del mínimo requerido (${proyecto.suscripciones_minimas}).</p>
                <p style="font-weight: bold;">Consecuencia: Dejaremos de generar pagos mensuales y de descontar meses del plazo. Te notificaremos tan pronto como se reanude. </p>
            </div>
        `;
    await this.sendEmail(user.email, subject, text, html);
  }, // <-- COMA
  /**
   * @async
   * @function notificarReversionAdmin (A ADMINISTRADORES)
   * @description Notifica a un administrador que un proyecto se revirtió a 'En Espera' por bajo umbral.
   * @param {object} adminEmail - Correo del admin.
   * @param {object} proyecto - Objeto del proyecto.
   */ async notificarReversionAdmin(adminEmail, proyecto) {
    const subject = `🛑 ALERTA CRÍTICA: Proyecto Revertido - ${proyecto.nombre_proyecto}`;
    const html = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #d9534f; border-left: 5px solid #d9534f;">
                <h2 style="color: #d9534f;">¡Aviso! Proyecto Revertido a 'En Espera'</h2>
                <p>El proyecto **"${proyecto.nombre_proyecto}"** (ID: ${proyecto.id}) ha sido **REVERTIDO** a 'En Espera'.</p>
                <p>Razón: Las suscripciones activas cayeron a **${proyecto.suscripciones_actuales}** (mínimo requerido: ${proyecto.suscripciones_minimas}).</p>
                <p style="font-weight: bold;">Se han pausado la generación de pagos y el conteo de meses. Por favor, revise el estado del proyecto y las suscripciones asociadas.</p>
            </div>
        `;
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
   */ async notificarFinalizacionAdmin(adminEmail, proyecto) {
    const subject = `✅ PROYECTO FINALIZADO - Acción: ${proyecto.nombre_proyecto}`;
    const html = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #007bff; border-left: 5px solid #007bff;">
                <h2 style="color: #007bff;">¡El Plazo del Proyecto ha Terminado!</h2>
                <p>El proyecto **"${proyecto.nombre_proyecto}"** (ID: ${proyecto.id}) ha completado su plazo de **${proyecto.plazo_inversion} meses**.</p>
                <h3 style="color: #d9534f;">⚠️ Tarea Crítica Requerida</h3>
                <p>Debe ingresar al panel para realizar las siguientes acciones de cierre:</p>
                <ul>
                    <li>Marcar el proyecto como 'Finalizado'.</li>
                    <li>Gestionar posibles **devoluciones** a suscriptores cancelados (si aplica).</li>
                    <li>Revisar el estado de los **lotes** pendientes de subastar (si aplica).</li>
                </ul>
                <p>El proyecto ha dejado de contar meses y notificar pagos. **Actúe inmediatamente**.</p>
            </div>
        `;
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
   */ async notificarPagoGenerado(
    user,
    proyecto,
    cuota,
    monto,
    fechaVencimiento
  ) {
    const subject = `Recordatorio de Pago: ${proyecto.nombre_proyecto} - Cuota ${cuota}`;

    const html = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #007bff; border-left: 5px solid #007bff;">
                <h2 style="color: #007bff;">¡Tu Pago Mensual ha sido Generado!</h2>
                <p>Hola **${user.nombre}**:</p>
                <p>Tu cuota **#${cuota}** para el proyecto **"${
      proyecto.nombre_proyecto
    }"** ha sido generada.</p>
                <h3 style="color: #333;">Detalles del Pago</h3>
                <ul style="list-style: none; padding-left: 0;">
                    <li><strong style="color: #555;">Monto a pagar:</strong> $${monto.toFixed(
      2
    )}</li>
                    <li><strong style="color: #555;">Cuota Nro:</strong> ${cuota}</li>
                    <li><strong style="color: #555;">Proyecto:</strong> ${
      proyecto.nombre_proyecto
    }</li>
                    <li><strong style="color: #d9534f;">Fecha Límite de Pago:</strong> **${fechaVencimiento}**</li>
                </ul>
                <p>Por favor, realiza el pago antes de la fecha límite para evitar recargos.</p>
                <a href="[URL_A_TU_PLATAFORMA]" style="display: inline-block; padding: 10px 20px; margin: 15px 0; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">
                    Ir a Mis Pagos
                </a>
                <p>Gracias por tu apoyo.</p>
            </div>
        `;

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
   */ async sendPasswordResetEmail(user, token) {
    // ⚠️ La URL base DEBE ser la del frontend que procesa el token de reset.
    // MODIFICADO: Uso de process.env.FRONTEND_URL
    const resetLink = `${process.env.FRONTEND_URL}/restablecer_contrasena?token=${token}`;
    const subject = "Solicitud de Restablecimiento de Contraseña";

    const html = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ffc107; border-left: 5px solid #ffc107;">
                <h2 style="color: #ffc107;">Hola ${user.nombre},</h2>
                <p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el siguiente enlace:</p>
                <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; margin: 15px 0; background-color: #ffc107; color: black; text-decoration: none; border-radius: 5px;">
                    Restablecer Contraseña
                </a>
                <p>Si no solicitaste esto, puedes ignorar este correo. El enlace expira en 1 hora.</p>
            </div>
        `;

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
    const html = `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #d9534f; border-left: 5px solid #d9534f;">
            <h2 style="color: #d9534f;">¡ALERTA DE PAGO VENCIDO!</h2>
            <p>El usuario **${user.nombre}** (Email: ${
      user.email
    }) ha incumplido el pago de la cuota **#${pago.mes}** para el proyecto **"${
      proyecto.nombre_proyecto
    }"**.</p>
            <h3 style="color: #333;">Detalles</h3>
            <ul style="list-style: none; padding-left: 0;">
                <li><strong style="color: #555;">ID Pago:</strong> ${
                  pago.id
                }</li>
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
        </div>
    `;

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
  async notificarReembolsoUsuario(user, transaccion, motivoFallo) {
    const userSubject =
      "⚠️ Acción Requerida: Tu Pago fue Rechazado y Reembolsado";
    const monto = parseFloat(transaccion.monto).toFixed(2);

    // --- Correo para el Usuario ---
    const userHtml = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ffc107; border-left: 5px solid #ffc107;">
                <h2 style="color: #ffc107;">Hola ${user.nombre},</h2>
                <p>Tu pago de **$${monto}** (Transacción #${transaccion.id}) para **${transaccion.tipo_transaccion}** fue aprobado, pero lamentablemente **falló nuestro proceso de registro interno**.</p>
                <p style="font-weight: bold;">Razón: ${motivoFallo}</p>
                <p style="color: green; font-weight: bold;">🚨 IMPORTANTE: El monto de $${monto} ha sido **REEMBOLSADO automáticamente** a tu medio de pago. El tiempo de acreditación depende de tu banco/tarjeta.</p>
                <p>Te pedimos disculpas. Por favor, intenta de nuevo o contacta a soporte.</p>
            </div>
        `;

    await this.sendEmail(
      user.email,
      userSubject,
      `Reembolso de $${monto} por fallo de negocio. Motivo: ${motivoFallo}`,
      userHtml
    );
  }, // <-- COMA

  /**
   * @async
   * @function notificarReembolsoAdmin
   * @description Notifica a un único administrador sobre un reembolso automático.
   * @param {string} adminEmail - Correo del administrador.
   * @param {object} user - Objeto del usuario (nombre, email, id).
   * @param {object} transaccion - Objeto de la transacción (id, monto, tipo_transaccion).
   * @param {string} motivoFallo - Mensaje de error de la lógica de negocio.
   */
  async notificarReembolsoAdmin(adminEmail, user, transaccion, motivoFallo) {
    const adminSubject = `🚨 REEMBOLSO CRÍTICO: Transacción #${transaccion.id} Fallo de Negocio`;
    const monto = parseFloat(transaccion.monto).toFixed(2);

    // --- Correo para el Administrador ---
    const adminHtml = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #d9534f; border-left: 5px solid #d9534f;">
                <h2 style="color: #d9534f;">¡ALERTA CRÍTICA! Reembolso de emergencia</h2>
                <p>El pago de $${monto} del usuario **${user.nombre}** (ID: ${user.id}, Email: ${user.email}) fue aprobado por MP, pero el sistema no pudo procesar la lógica de negocio.</p>
                <h3 style="color: #333;">Detalles del Fallo y Reembolso</h3>
                <ul style="list-style: none; padding-left: 0;">
                    <li><strong style="color: #555;">Transacción ID:</strong> ${transaccion.id}</li>
                    <li><strong style="color: #555;">Monto:</strong> $${monto}</li>
                    <li><strong style="color: #d9534f;">Motivo del Fallo:</strong> ${motivoFallo}</li>
                    <li><strong style="color: #4CAF50;">Reembolso:</strong> Solicitado automáticamente a MP.</li>
                </ul>
                <p style="font-weight: bold;">Por favor, verifique la causa raíz del error interno.</p>
            </div>
        `;

    await this.sendEmail(
      adminEmail,
      adminSubject,
      `Reembolso automático para Transacción #${transaccion.id} del usuario ${user.email}. Motivo: ${motivoFallo}`,
      adminHtml
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

    const html = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #d9534f; border-left: 5px solid #d9534f; background-color: #fcf8f8;">
                <h2 style="color: #d9534f;">¡ATENCIÓN, PAGO VENCIDO!</h2>
                <p>Estimado/a **${usuario.nombre}**:</p>
                <p>Queremos recordarte que la cuota del **Mes ${pago.mes}** para tu suscripción al proyecto **"${proyecto.nombre_proyecto}"** ha vencido.</p>
                <h3 style="color: #333;">Detalles del Recargo</h3>
                <ul style="list-style: none; padding-left: 0;">
                    <li><strong style="color: #555;">Monto Original:</strong> $${montoBaseTexto}</li>
                    <li><strong style="color: #555;">Recargo Diario Acumulado:</strong> $${recargoTotalTexto}</li>
                    <li><strong style="color: #d9534f; font-size: 1.1em;">NUEVO MONTO A PAGAR:</strong> **$${montoActualTexto}**</li>
                </ul>
                <p style="font-weight: bold;">Por favor, realiza el pago a la brevedad para evitar la suspensión de tu inversión y mayores recargos por el interés compuesto diario.</p>
                <a href="[URL_A_TUS_PAGOS]" style="display: inline-block; padding: 10px 20px; margin: 15px 0; background-color: #d9534f; color: white; text-decoration: none; border-radius: 5px;">
                    Pagar Ahora
                </a>
            </div>
        `;

    await this.sendEmail(
      usuario.email,
      subject,
      `Tu pago de $${montoActualTexto} para el proyecto ${proyecto.nombre_proyecto} ha vencido.`,
      html
    );
  }, // <-- ¡NO OLVIDES LA COMA!

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

    const html = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #007bff; border-left: 5px solid #007bff; background-color: #f7f9fc;">
                <h2 style="color: #007bff;">¡Recordatorio de Pago!</h2>
                <p>Hola **${usuario.nombre}**:</p>
                <p>Tu cuota **#${pago.mes}** de **$${montoCuota}** para el proyecto **"${proyecto.nombre_proyecto}"** está próxima a vencer.</p>
                <h3 style="color: #d9534f;">Fecha Límite: ${fechaVencimiento}</h3>
                <p>Te recomendamos realizar el pago antes de la fecha límite para evitar los recargos por mora que se aplican diariamente.</p>
                <a href="[URL_A_TUS_PAGOS]" style="display: inline-block; padding: 10px 20px; margin: 15px 0; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">
                    Revisar y Pagar
                </a>
                <p>Gracias por tu compromiso con la inversión.</p>
            </div>
        `;

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
  async notificarReembolsoAdmin(
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
    const colorBorde = reembolsoExitoso ? "#4CAF50" : "#d9534f";
    const estadoReembolso = reembolsoExitoso
      ? `<p style="color: #4CAF50; font-weight: bold;">✅ El reembolso fue procesado exitosamente por Mercado Pago.</p>`
      : `<p style="color: #d9534f; font-weight: bold;">⚠️ EL REEMBOLSO FALLÓ. Debes realizarlo MANUALMENTE.</p>
       <p style="background-color: #fff3cd; padding: 10px; border-left: 3px solid #ffc107;">
         <strong>Error:</strong> ${errorReembolso || "Sin detalles del error"}
       </p>`;

    const accionRequerida = reembolsoExitoso
      ? `<p>No se requiere acción adicional. El usuario recibirá el reembolso en 5-10 días hábiles según su banco.</p>`
      : `<p style="font-weight: bold; font-size: 1.1em;">⚠️ ACCIÓN CRÍTICA REQUERIDA:</p>
       <ol style="line-height: 1.8;">
         <li>Ingresa al panel de <a href="https://www.mercadopago.com.ar/activities" target="_blank">Mercado Pago</a></li>
         <li>Busca el pago con ID: <strong>${idPagoMP}</strong></li>
         <li>Realiza el reembolso manual de <strong>$${monto}</strong></li>
         <li>Contacta al usuario para confirmar: ${user.email}</li>
       </ol>`;

    const adminHtml = `
    <div style="font-family: sans-serif; padding: 20px; border: 1px solid ${colorBorde}; border-left: 5px solid ${colorBorde};">
      <h2 style="color: ${colorBorde};">${
      reembolsoExitoso ? "✅ Reembolso Procesado" : "🚨 ALERTA CRÍTICA"
    }</h2>
      <p>El pago de <strong>$${monto}</strong> del usuario <strong>${
      user.nombre
    }</strong> (ID: ${user.id}, Email: ${
      user.email
    }) fue aprobado por MP, pero el sistema no pudo procesar la lógica de negocio.</p>
      
      <h3 style="color: #333;">📋 Detalles del Fallo y Reembolso</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
        <tr style="background-color: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Transacción ID:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${
            transaccion.id
          }</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Tipo:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${tipoTransaccion}</td>
        </tr>
        <tr style="background-color: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Monto:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>$${monto}</strong></td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>ID Pago MP:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${idPagoMP}</td>
        </tr>
        <tr style="background-color: #fff3cd;">
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Motivo del Fallo:</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${motivoFallo}</td>
        </tr>
      </table>

      ${estadoReembolso}
      ${accionRequerida}

      <hr style="margin: 20px 0; border: none; border-top: 1px solid #dee2e6;">
      <p style="font-size: 0.9em; color: #6c757d;">
        💡 <strong>Causa raíz probable:</strong> ${
          motivoFallo.includes("cupos")
            ? "El proyecto alcanzó su capacidad mientras el usuario pagaba."
            : motivoFallo.includes("expiró")
            ? "La transacción tardó más de 30 minutos en confirmarse."
            : "Estado del proyecto cambió durante el proceso de pago."
        }
      </p>
    </div>
  `;

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
  }, // <-- COMA
};

module.exports = emailService;
