// middlewares/imageUpload.middleware.js
const multer = require("multer");
const path = require("path");
const { formatErrorResponse } = require("../utils/responseUtils");

// ===================================================================
// 1. 💾 Configuración de Almacenamiento (todo en memoria)
// ===================================================================
const memoryStorage = multer.memoryStorage(); // 🔥 Ahora todas las subidas usan memoria

// ===================================================================
// 2. 📝 Filtros de Archivo
// ===================================================================

/** Filtro para archivos de Contrato (Solo PDF). */
const pdfFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(
      new Error("Solo se permiten archivos PDF para contratos y plantillas."),
      false,
    );
  }
};

/** Filtro para archivos KYC (Imágenes y PDF). */
const kycFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith("image/") ||
    file.mimetype === "application/pdf" ||
    file.mimetype.startsWith("video/")
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Tipo de archivo no permitido para Verificación de Identidad (KYC).",
      ),
      false,
    );
  }
};

/** Filtro para imágenes de Proyectos/Lotes (Solo imágenes). */
const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Solo se permiten archivos de imagen."), false);
  }
};

// ===================================================================
// 3. 📦 Configuraciones de Subida Base (todo con memoryStorage)
// ===================================================================

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

const pdfUploadBase = multer({
  storage: memoryStorage,
  fileFilter: pdfFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

const kycUploadBase = multer({
  storage: memoryStorage,
  fileFilter: kycFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

const imageUploadBase = multer({
  storage: memoryStorage, // ✅ Antes usaba diskStorage, ahora memoria
  fileFilter: imageFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ===================================================================
// 4. Exportamos los middlewares específicos
// ===================================================================

module.exports = {
  uploadSignedContract: pdfUploadBase.single("pdfFile"),
  uploadPlantilla: pdfUploadBase.single("plantillaFile"),
  uploadKYCData: kycUploadBase.fields([
    { name: "documento_frente", maxCount: 1 },
    { name: "documento_dorso", maxCount: 1 },
    { name: "selfie_con_documento", maxCount: 1 },
    { name: "video_verificacion", maxCount: 1 },
  ]),
  uploadImage: imageUploadBase.single("image"), // ✅ Ahora también en memoria
};
