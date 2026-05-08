// routes/audit.routes.js
const express = require("express");
const router = express.Router();
const auditController = require("../controllers/audit.controller");
const authMiddleware = require("../middleware/auth.middleware");

// Todas las rutas requieren autenticación y rol de administrador
router.use(authMiddleware.authenticate, authMiddleware.authorizeAdmin);

// Obtener logs con paginación y filtros
router.get("/", auditController.getLogs);

// Obtener logs de una entidad específica (útil para auditoría por registro)
router.get(
  "/entidad/:entidadTipo/:entidadId",
  auditController.getLogsByEntidad,
);

// (Opcional) Limpieza manual de logs antiguos
router.delete("/limpiar", auditController.limpiarLogs);

module.exports = router;
