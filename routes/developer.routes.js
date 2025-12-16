// Archivo: routes/developer.routes.js

const express = require('express');
const router = express.Router();

/**
 * @route GET /api/developer
 * @description Retorna información del desarrollador del backend
 * @access Public
 */
router.get('/', (req, res) => {
  res.status(200).json({
    message: "Backend desarrollado por:",
    developer: {
      name: "Sebastian Astudillo",
      email: "astudilllo5677@gmail.com",
      linkedin: "www.linkedin.com/in/sebastian-astudillo-008788299", // Opcional
    },
    copyright: `© ${new Date().getFullYear()} Sebastian Astudillo. Todos los derechos reservados.`,
    note: "Este backend fue desarrollado íntegramente por el autor mencionado. Cualquier reutilización o modificación debe dar el crédito correspondiente."
  });
});

/**
 * @route GET /api/developer/stats
 * @description Muestra estadísticas del sistema (opcional)
 * @access Public
 */
router.get('/stats', (req, res) => {
  res.status(200).json({
    developer: "Sebastian Astudillo",
    backend_info: {
      endpoints_count: "50+",
      models_count: 15,
      scheduled_tasks: 9,
      features: [
        "Sistema de autenticación JWT",
        "Integración con Mercado Pago",
        "Sistema de subastas en tiempo real",
        "Gestión de inversiones",
        "Sistema de mensajería",
        "Verificación KYC",
        "Generación de contratos",
        "Tareas programadas (CRON)",
        "Sistema de cuotas mensuales",
        "Notificaciones automáticas"
      ]
    }
  });
});

module.exports = router;