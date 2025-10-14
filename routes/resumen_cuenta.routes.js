// Archivo: routes/resumen_cuenta.routes.js

const express = require("express");
const router = express.Router();
const resumenCuentaController = require("../controllers/resumen_cuenta.controller");
const authMiddleware = require("../middleware/auth.middleware");

// --- Rutas de Lectura (CRUD - Read) ---

// 1. NUEVA RUTA DE USUARIO: Obtener SOLO los resúmenes del usuario autenticado.
router.get(
  "/mis_resumenes", // <-- RUTA ESPECÍFICA para el usuario
  authMiddleware.authenticate,
  resumenCuentaController.findMyAccountSummaries // <-- NUEVO MÉTODO
);

// 2. Ruta protegida para ADMINISTRADORES: Obtener TODOS los resúmenes.
router.get(
  "/", // <-- Ahora solo para administradores
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  resumenCuentaController.findAll // <-- Método renombrado
);

// 3. Obtener un resumen de cuenta específico por su ID (USUARIO/ADMIN).
// ⚠️ Debe ir DESPUÉS de /mis_resumenes
router.get(
  "/:id",
  authMiddleware.authenticate,
  resumenCuentaController.getAccountSummaryById // Se actualizará para verificar la propiedad del usuario/admin.
);

// --- Rutas de Administración (CRUD - Create, Update, Delete) ---

// 4. Ruta para que un administrador pueda ACTUALIZAR manualmente un resumen de cuenta.
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  resumenCuentaController.update
);

// 5. Ruta para que un administrador pueda ELIMINAR lógicamente un resumen de cuenta.
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  resumenCuentaController.softDelete
);

module.exports = router;
