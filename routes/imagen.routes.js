const express = require("express");
const router = express.Router();
const imagenController = require("../controllers/imagen.controller");
const authMiddleware = require("../middleware/auth.middleware");
const imageUpload = require("../middleware/imageUpload.middleware"); // <-- 1. Importar el middleware

// ===============================================
// 1. RUTAS ESTÁTICAS Y CON PREFIJO (TODAS)
// Estas deben ir PRIMERO.
// ===============================================

// Rutas de consulta para usuarios (NO necesitan ser administradores)

// Endpoint para obtener todas las imágenes activas de un PROYECTO
router.get(
  "/proyecto/:idProyecto",
  authMiddleware.authenticate,
  imagenController.getImagesByProjectId
);
// Endpoint para obtener todas las imágenes activas de un LOTE
router.get(
  "/lote/:idLote",
  authMiddleware.authenticate,
  imagenController.getImagesByLoteId
);
// ✅ RUTA CORREGIDA: Obtener todas las imágenes activas (va antes de /:id)
router.get(
  "/activas",
  authMiddleware.authenticate,
  imagenController.findAllActivo
);

// Rutas para administradores (Estáticas y con prefijo)

// -------------------------------------------------------------------
// RUTA CREATE ACTUALIZADA (POST Estático)
// -------------------------------------------------------------------
router.post(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  imageUpload.single("image"),
  imagenController.create
);
// -------------------------------------------------------------------

// Obtener todas (GET Estático)
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  imagenController.findAll
);

// ✅ RUTA CORREGIDA: Usa el prefijo /admin/:id (va antes de la genérica /:id)
router.get(
  "/admin/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  imagenController.findById
);

// ===============================================
// 2. RUTAS DINÁMICAS GENÉRICAS (DEBEN IR AL FINAL)
// ===============================================

// Ruta de usuario: Usa findByIdActivo (la más genérica GET, va al final)
router.get(
  "/:id",
  authMiddleware.authenticate,
  imagenController.findByIdActivo
);

// Rutas de Administrador (PUT y DELETE genéricos)
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  imagenController.update
);
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  imagenController.softDelete
);

module.exports = router;
