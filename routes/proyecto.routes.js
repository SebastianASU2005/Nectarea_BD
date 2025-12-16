const express = require("express");
const router = express.Router();
const proyectoController = require("../controllers/proyecto.controller");
const authMiddleware = require("../middleware/auth.middleware");

// ===============================================
// 1. RUTAS ESTÁTICAS Y CON PREFIJO (USUARIO & ADMIN)
// ===============================================

// Rutas de Usuario
router.get(
  "/activos",
  authMiddleware.authenticate,
  proyectoController.findAllActivo
);

// 🎯 NUEVA RUTA: Proyectos de Ahorristas (Mensual)
router.get(
  "/activos/ahorristas",
  
  proyectoController.findAllActivoAhorristas
);

// 🎯 NUEVA RUTA: Proyectos de Inversionistas (Directo)
router.get(
  "/activos/inversionistas",

  proyectoController.findAllActivoInversionistas
);
// Ruta de usuario para proyectos propios (asumo que es /me o similar, si no está definida)
router.get(
  "/mis-proyectos",
  authMiddleware.authenticate,
  proyectoController.findMyProjects
);

// Rutas de Administrador (Estáticas)
// 📊 NUEVA RUTA: Tasa de Culminación (KPI 4)
router.get(
  "/metricas/culminacion",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  proyectoController.getCompletionRate
);

// 📊 NUEVA RUTA: Avance Mensual de Suscripciones (KPI 5)
router.get(
  "/metricas/avance-mensual",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  proyectoController.getMonthlyProgress
);
router.post(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  proyectoController.create
);
// Listar todos (Admin)
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  proyectoController.findAll
);

// ===============================================
// 2. RUTAS DINÁMICAS (TODAS)
// ===============================================

// Ruta dinámica específica del usuario (con sufijo)
router.get(
  "/:id/activo",
  authMiddleware.authenticate,
  proyectoController.findByIdActivo
);

// 🚨 NUEVA RUTA: ASIGNAR LOTES A UN PROYECTO EXISTENTE (Admin)
router.put(
  "/:id/lotes",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  proyectoController.asignarLotes // <-- Nuevo controlador
);

// Ruta para INICIAR EL PROCESO (Admin)
router.put(
  "/:id/iniciar-proceso",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  proyectoController.iniciarProceso
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
