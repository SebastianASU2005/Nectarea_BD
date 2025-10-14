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
