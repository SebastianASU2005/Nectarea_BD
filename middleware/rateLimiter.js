// Archivo: middlewares/rateLimiter.js

const rateLimit = require("express-rate-limit");

/**
 * 🔐 Limitador para la ruta de LOGIN (fuerza bruta de contraseñas)
 * Límite: 5 intentos en 5 minutos por IP.
 */
const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutos (ventana de tiempo)
    max: 5, // Máximo de 5 intentos por IP
    message: {
        success: false,
        error: "Demasiados intentos de inicio de sesión fallidos. Por favor, inténtalo de nuevo en 5 minutos.",
    },
    statusCode: 429, // Código HTTP "Too Many Requests"
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * 🔒 Limitador para la verificación 2FA (fuerza bruta de códigos TOTP)
 * Límite: 3 intentos en 1 minuto por IP.
 */
const fa2Limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto (ventana de tiempo más corta)
    max: 3, // Máximo de 3 intentos por IP (más estricto)
    message: {
        success: false,
        error: "Límite de verificación 2FA excedido. Inténtalo de nuevo en 1 minuto.",
    },
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = { loginLimiter, fa2Limiter };