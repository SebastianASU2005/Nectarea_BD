const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config();

// Configura el transportador de correo. Puedes usar otros servicios como SendGrid o Mailgun.
const transporter = nodemailer.createTransport({
  service: "gmail", // Por ejemplo, 'gmail'
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const emailService = {
  /**
   * Envía un correo electrónico a un destinatario (Función base).
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
      throw new Error(`Error al enviar el correo.`);
    }
  },
  /**
   * 🚀 Envía el correo electrónico de confirmación.
   */
  async sendConfirmationEmail(user, token) {
    // ⚠️ REEMPLAZA ESTA URL BASE CON LA DE TU APLICACIÓN FRONTEND
    const confirmationLink = `http://localhost:3000/api/auth/confirmar_email/${token}`;
    const subject = "¡Bienvenido! Confirma tu Cuenta de Usuario"; // Cuerpo del correo en HTML
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
      `Confirma tu cuenta en ${confirmationLink}`, // Texto plano
      html // HTML
    );
  },

  /**
   * 🚀 Notifica al usuario que ha ganado un lote (inicial o por reasignación).
   * @param {Object} user - Objeto del nuevo ganador.
   * @param {number} loteId - ID del lote ganado.
   * @param {string} fechaLimite - Fecha límite de pago.
   * @param {boolean} esReasignacion - Indica si es por incumplimiento.
   */
  async notificarGanadorPuja(
    user,
    loteId,
    fechaLimite,
    esReasignacion = false
  ) {
    const subject = `¡Felicidades! Ganaste el Lote #${loteId}`;

    // Contenido dinámico según si es reasignación
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
  },

  /**
   * 🚀 NUEVA FUNCIÓN: Notifica al usuario que perdió un lote por impago.
   * @param {Object} user - Objeto del usuario incumplidor.
   * @param {number} loteId - ID del lote perdido.
   */
  async notificarImpago(user, loteId) {
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
  },
};

module.exports = emailService;
