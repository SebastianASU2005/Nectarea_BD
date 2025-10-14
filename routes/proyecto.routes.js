const express = require("express");
const router = express.Router();
const proyectoController = require("../controllers/proyecto.controller");
const authMiddleware = require("../middleware/auth.middleware");

// ===============================================
// 1. RUTAS ESTÁTICAS Y CON PREFIJO (USUARIO & ADMIN)
// Estas deben ir ANTES que cualquier /:id genérico.
// ===============================================

// Rutas de Usuario
router.get(
  "/activos",
  authMiddleware.authenticate,
  proyectoController.findAllActivo
);

// Rutas de Administrador (Estáticas)
router.post(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  proyectoController.create
);
// Esta ruta de LISTAR TODO debe ir aquí para no capturar las dinámicas.
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  proyectoController.findAll
);

// ===============================================
// 2. RUTAS DINÁMICAS (TODAS)
// Estas DEBEN ir al final del archivo.
// ===============================================

// Ruta dinámica específica del usuario (con sufijo)
// Va antes de /:id genérico
router.get(
  "/:id/activo",
  authMiddleware.authenticate,
  proyectoController.findByIdActivo
);

// Rutas genéricas de Administrador (CRUD por ID)
router.get(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  proyectoController.findById
);
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  proyectoController.update
);
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  proyectoController.softDelete
);

module.exports = router;
