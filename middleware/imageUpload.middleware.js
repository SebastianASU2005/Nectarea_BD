const multer = require("multer");
const path = require("path");
// No es estrictamente necesaria aquí, pero la mantenemos si es una utilidad común
// Asumimos que esta importación ya funciona gracias al paso anterior.
const { formatErrorResponse } = require("../utils/responseUtils");

// ===================================================================
// 1. 💾 Configuración de Almacenamiento
// ===================================================================

// A. ALMACENAMIENTO EN MEMORIA (Para Contratos y KYC)
// Almacena el archivo como un Buffer en req.file.buffer
const memoryStorage = multer.memoryStorage();

// B. ALMACENAMIENTO EN DISCO (Para Imágenes de Proyectos/Lotes)
// Debe ser consistente con la configuración de /uploads/imagenes en app.js
const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Usa la ruta de subida de imágenes definida globalmente
    cb(null, "uploads/imagenes/");
  },
  filename: function (req, file, cb) {
    // Genera un nombre de archivo único
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

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
      false
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
        "Tipo de archivo no permitido para Verificación de Identidad (KYC)."
      ),
      false
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
// 3. 📦 Configuraciones de Subida Base
// ===================================================================

// Limite de tamaño: 15MB
const MAX_FILE_SIZE = 15 * 1024 * 1024;

// Base para la subida de PDF (Contratos Firmados y Plantillas) -> USA MEMORIA
const pdfUploadBase = multer({
  storage: memoryStorage,
  fileFilter: pdfFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// Base para la subida de archivos KYC -> USA MEMORIA
const kycUploadBase = multer({
  storage: memoryStorage,
  fileFilter: kycFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// Base para la subida de IMAGENES -> USA DISCO
const imageUploadBase = multer({
  storage: diskStorage,
  fileFilter: imageFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ===================================================================
// 4. Exportamos los middlewares específicos
// ===================================================================

module.exports = {
  // SUBIDAS EN MEMORIA (CONTRATOS/KYC)
  uploadSignedContract: pdfUploadBase.single("pdfFile"),
  uploadPlantilla: pdfUploadBase.single("plantillaFile"),
  uploadKYCData: kycUploadBase.fields([
    { name: "documento_frente", maxCount: 1 },
    { name: "documento_dorso", maxCount: 1 },
    { name: "selfie_con_documento", maxCount: 1 },
    { name: "video_verificacion", maxCount: 1 },
  ]), // 🚨 NUEVA FUNCIÓN: SUBIDA EN DISCO (IMAGENES) // Campo esperado en el formulario: 'image'

  uploadImage: imageUploadBase.single("image"),
};
