// middleware/roleValidation.js

/**
 * Middleware para validar que el usuario NO sea administrador.
 * Se usa en endpoints de transacciones financieras (suscripciones, inversiones, pujas, pagos).
 */
const blockAdminTransactions = (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      error: "Usuario no autenticado. Inicia sesión para continuar.",
    });
  }

  if (req.user.rol === "admin") {
    // ✅ LOG DE SEGURIDAD
    console.warn(
      `⚠️ [SEGURIDAD] Admin ID ${req.user.id} intentó realizar transacción financiera en ${req.method} ${req.originalUrl}`
    );

    return res.status(403).json({
      error:
        "⛔ Acceso denegado. Los administradores no pueden realizar transacciones financieras como clientes por motivos de seguridad y prevención de conflictos de interés.",
    });
  }

  next();
};

module.exports = { blockAdminTransactions };
