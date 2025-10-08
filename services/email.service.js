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
   * 🚀 NUEVA FUNCIÓN CLAVE: Envía el correo electrónico de confirmación.
   * @param {Object} user - El objeto de usuario (debe tener .email y .nombre).
   * @param {string} token - El token de confirmación generado.
   */ async sendConfirmationEmail(user, token) {
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
    `; // Reutilizamos la función sendEmail para enviar el correo

    await this.sendEmail(
      user.email,
      subject,
      `Confirma tu cuenta en ${confirmationLink}`, // Texto plano
      html // HTML
    );
  },
};

module.exports = emailService;
