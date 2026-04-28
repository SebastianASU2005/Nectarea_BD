// routes/usuario.routes.js
const express = require("express");
const router = express.Router();
const usuarioController = require("../controllers/usuario.controller");
const authMiddleware = require("../middleware/auth.middleware");

// ===========================================
// Rutas de administración (Estáticas y Base)
// ===========================================

// Crear usuario (público)
router.post("/", usuarioController.create);

// Listar todos los usuarios (admin)
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.findAll,
);

// Listar usuarios activos (admin)
router.get(
  "/activos",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.findAllActivo,
);

// Listar administradores activos (admin)
router.get(
  "/admins",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.findAllAdmins,
);

// Buscar usuarios por nombre de usuario o email (admin)
router.get(
  "/search",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.search,
);

// ===========================================
// Rutas de Usuario Propio y Verificación
// ===========================================

// Confirmar email (público)
router.get("/confirmar/:token", usuarioController.confirmEmail);

// Obtener perfil propio
router.get("/me", authMiddleware.authenticate, usuarioController.findMe);

// Actualizar perfil propio
router.put("/me", authMiddleware.authenticate, usuarioController.updateMe);

// Validar si se puede desactivar la cuenta (solo advertencias)
router.get(
  "/me/validate-deactivation",
  authMiddleware.authenticate,
  usuarioController.validateDeactivation,
);

// Cambiar contraseña (requiere 2FA si está activo)
router.patch(
  "/me/change-password",
  authMiddleware.authenticate,
  usuarioController.changePassword,
);

// ===============================================
// CANCELACIÓN DE CUENTA CON 2FA (dos pasos)
// ===============================================

// Paso 1: Iniciar cancelación de cuenta
router.post(
  "/me/iniciar-cancelacion",
  authMiddleware.authenticate,
  usuarioController.iniciarCancelacionCuenta,
);

// Paso 2: Confirmar cancelación con código 2FA
router.post(
  "/me/confirmar-cancelacion",
  authMiddleware.authenticate,
  usuarioController.confirmarCancelacionCuenta,
);

// ===========================================
// Rutas de administración (Dinámicas /:id)
// Estas DEBEN ir al final.
// ===========================================

// Preparar cuenta inactiva para reactivación (admin)
router.patch(
  "/:id/prepare-reactivation",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.prepareForReactivation,
);

// Resetear contraseña de un usuario (admin)
router.patch(
  "/:id/reset-password",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.adminResetPassword,
);

// Reactivar cuenta inactiva (admin)
router.patch(
  "/:id/reactivate",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.reactivateAccount,
);

// Resetear 2FA de un usuario (admin)
router.patch(
  "/:id/reset-2fa",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.adminReset2FA,
);

// Obtener usuario por ID (admin)
router.get(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.findById,
);

// Actualizar usuario por ID (admin)
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.update,
);

// Desactivar usuario por ID (admin)
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.softDelete,
);

module.exports = router;
