const express = require("express");
const router = express.Router();
const resumenCuentaController = require("../controllers/resumen_cuenta.controller");
const authMiddleware = require("../middleware/auth.middleware"); // Asumimos que tienes un archivo de middleware

// --- Rutas de Lectura (CRUD - Read) ---

// 1. Obtener TODOS los resúmenes de cuenta del usuario autenticado.
// (Protegida para el usuario mismo)
router.get(
  "/",
  authMiddleware.authenticate,
  resumenCuentaController.getAccountSummaries
);

// 2. Obtener un resumen de cuenta específico por su ID.
// (Útil para ver un resumen individual y verificar el historial. También protegida para el usuario.)
router.get(
  "/:id",
  authMiddleware.authenticate,
  resumenCuentaController.getAccountSummaryById // Necesitamos agregar este método al controlador.
);

// --- Rutas de Administración (CRUD - Create, Update, Delete) ---

// 3. Ruta para que un administrador pueda ACTUALIZAR manualmente un resumen de cuenta.
// (Solo para administradores, para correcciones o ajustes manuales)
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  resumenCuentaController.update
);

// 4. Ruta para que un administrador pueda ELIMINAR lógicamente un resumen de cuenta.
// (Solo para administradores)
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  resumenCuentaController.softDelete // o .delete, según tu convención
);

module.exports = router;
