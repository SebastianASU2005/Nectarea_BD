const express = require("express");
const router = express.Router();
const loteController = require("../controllers/lote.controller");
const authMiddleware = require("../middleware/auth.middleware");

// ===============================================
// 1. RUTAS ESTÁTICAS Y CON PREFIJO (TODAS)
// ===============================================

// Rutas Estáticas de Administrador (CREATE/READ ALL)
router.post(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  loteController.create
);
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  loteController.findAll
); // Obtener todos (va antes que /:id)

// Rutas de lotes activos (para que los usuarios puedan verlos)
router.get(
  "/activos",
  authMiddleware.authenticate,
  loteController.findAllActivo
); // ✅ Va antes que /:id

// ===============================================
// 2. RUTAS DINÁMICAS ESPECÍFICAS (con ID y sufijo)
// ===============================================

// Rutas de Subasta (con ID y sufijo)
router.post(
  "/:id/start_auction",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  loteController.startAuction
);
router.put(
  "/:id/end",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  loteController.endAuction
);

// Ruta de Lote Activo por ID (con ID y sufijo)
router.get(
  "/:id/activo",
  authMiddleware.authenticate,
  loteController.findByIdActivo
);

// ===============================================
// 3. RUTAS DINÁMICAS GENÉRICAS (CRUD por ID)
// Estas DEBEN ir al final.
// ===============================================

router.get(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  loteController.findById
);
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  loteController.update
);
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  loteController.softDelete
);

module.exports = router;
