const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

// Configura el transportador de correo. Puedes usar otros servicios como SendGrid o Mailgun.
const transporter = nodemailer.createTransport({
  service: 'gmail', // Por ejemplo, 'gmail'
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const emailService = {
  /**
   * Envía un correo electrónico a un destinatario.
   * @param {string} to - El correo del destinatario.
   * @param {string} subject - El asunto del correo.
   * @param {string} text - El cuerpo del correo en texto plano.
   * @param {string} html - El cuerpo del correo en HTML (opcional).
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
};

module.exports = emailService;