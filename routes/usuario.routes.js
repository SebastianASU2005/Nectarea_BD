// Archivo: routes/usuario.routes.js

const express = require("express");
const router = express.Router();
const usuarioController = require("../controllers/usuario.controller");
const authMiddleware = require("../middleware/auth.middleware");

// ===========================================
// Rutas de administración (Estáticas y Base)
// ===========================================
router.post("/", usuarioController.create);
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.findAll
);
router.get(
  "/activos",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.findAllActivo
);
// 🆕 RUTA AÑADIDA: Obtener solo administradores activos
router.get(
  "/admins",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.findAllAdmins
);
router.get(
  "/search",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.search
);

// ===========================================
// Rutas de Usuario Propio y Verificación (CON PREFIJO)
// ===========================================

// 🚀 RUTA CLAVE: Va antes de /:id para que "confirmar" no sea tomado como ID.
router.get("/confirmar/:token", usuarioController.confirmEmail);

// Rutas /me: Van antes de /:id para que "me" no sea tomado como ID.
router.get("/me", authMiddleware.authenticate, usuarioController.findMe);
router.put("/me", authMiddleware.authenticate, usuarioController.updateMe);
router.delete(
  "/me",
  authMiddleware.authenticate,
  usuarioController.softDeleteMe
);

// ===========================================
// Rutas de administración (DINÁMICAS /:id)
// Estas DEBEN ir al final.
// ===========================================
router.patch(
    "/:id/reset-2fa",
    authMiddleware.authenticate,
    authMiddleware.authorizeAdmin, // 🛡️ CRÍTICO: SOLO ADMIN
    usuarioController.adminReset2FA // Controlador que creamos
);

router.get(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.findById
);
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.update
);
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  usuarioController.softDelete
);

module.exports = router;
