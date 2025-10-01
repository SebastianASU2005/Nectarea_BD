const express = require("express");
const router = express.Router();
const imagenController = require("../controllers/imagen.controller");
const authMiddleware = require("../middleware/auth.middleware");
const imageUpload = require("../middleware/imageUpload.middleware"); // <-- 1. Importar el middleware

// Rutas de consulta para usuarios (NO necesitan ser administradores)
// NOTA: Se usan rutas más específicas para evitar colisión con /:id
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
// Endpoint para obtener todas las imágenes activas (sin filtrar por proyecto/lote)
router.get(
  "/activas",
  authMiddleware.authenticate,
  imagenController.findAllActivo
);
// Usa findByIdActivo para que los usuarios solo puedan ver imágenes activas
router.get(
  "/:id",
  authMiddleware.authenticate,
  imagenController.findByIdActivo
);

// Rutas para administradores (Se colocan después de las más específicas para evitar colisiones)

// -------------------------------------------------------------------
// *** RUTA CREATE ACTUALIZADA CON EL MIDDLEWARE DE SUBIDA DE IMAGEN ***
// -------------------------------------------------------------------
router.post(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  imageUpload.single("image"), // <-- 2. Insertar el middleware de Multer AQUÍ
  imagenController.create
);
// -------------------------------------------------------------------

router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  imagenController.findAll
);
// Usa findById para que los administradores puedan ver imágenes eliminadas
router.get(
  "/admin/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  imagenController.findById
);
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
