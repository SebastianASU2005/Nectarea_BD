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

// 🔒 HARDENING: errores de validación de subida seguros de mostrar al cliente
const uploadError = (msg) => {
  const e = new Error(msg);
  e.expose = true;
  return e;
};

/** Tipos MIME permitidos en KYC (subidos por usuarios finales). */
const KYC_ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/3gpp",
]);

/** Filtro para archivos de Contrato (Solo PDF). */
const pdfFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(
      uploadError("Solo se permiten archivos PDF para contratos y plantillas."),
      false,
    );
  }
};

/** Filtro para archivos KYC (Imágenes y PDF). */
const kycFilter = (req, file, cb) => {
  if (KYC_ALLOWED_MIMES.has(String(file.mimetype).toLowerCase())) {
    cb(null, true);
  } else {
    cb(
      uploadError(
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
    cb(uploadError("Solo se permiten archivos de imagen."), false);
  }
};

// ===================================================================
// 2.b 🔒 Verificación del CONTENIDO real del archivo (magic bytes)
// El mimetype lo declara el cliente y es falsificable; se comprueba la firma del archivo.
// ===================================================================
const startsWith = (buf, bytes, offset = 0) =>
  buf.length >= offset + bytes.length &&
  bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf, str, offset = 0) =>
  startsWith(buf, [...str].map((c) => c.charCodeAt(0)), offset);

/** Devuelve true/false si la firma coincide, o null si no hay regla para ese tipo. */
function contentMatchesMime(buf, mime) {
  const m = String(mime).toLowerCase();
  if (m === "application/pdf") return ascii(buf, "%PDF-");
  if (m === "image/jpeg") return startsWith(buf, [0xff, 0xd8, 0xff]);
  if (m === "image/png")
    return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (m === "image/gif") return ascii(buf, "GIF87a") || ascii(buf, "GIF89a");
  if (m === "image/webp") return ascii(buf, "RIFF") && ascii(buf, "WEBP", 8);
  if (
    ["image/heic", "image/heif", "image/avif", "video/mp4", "video/quicktime", "video/3gpp"].includes(m)
  )
    return ascii(buf, "ftyp", 4);
  if (m === "video/webm") return startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3]);
  return null;
}

function verifyUploadedContent(req, res, next) {
  const files = [];
  if (req.file) files.push(req.file);
  if (req.files) {
    if (Array.isArray(req.files)) files.push(...req.files);
    else Object.values(req.files).forEach((arr) => files.push(...arr));
  }
  for (const f of files) {
    if (!f.buffer || f.buffer.length === 0) {
      return res.status(400).json({ error: "El archivo subido está vacío." });
    }
    if (contentMatchesMime(f.buffer, f.mimetype) === false) {
      return res.status(400).json({
        error: `El contenido del archivo "${f.fieldname}" no coincide con su tipo declarado.`,
      });
    }
  }
  next();
}

// Multer + verificación de contenido, encadenados (Express acepta arrays de middlewares)
const withContentCheck = (multerHandler) => [multerHandler, verifyUploadedContent];

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
  uploadSignedContract: withContentCheck(pdfUploadBase.single("pdfFile")),
  uploadPlantilla: withContentCheck(pdfUploadBase.single("plantillaFile")),
  uploadKYCData: withContentCheck(
    kycUploadBase.fields([
      { name: "documento_frente", maxCount: 1 },
      { name: "documento_dorso", maxCount: 1 },
      { name: "selfie_con_documento", maxCount: 1 },
      { name: "video_verificacion", maxCount: 1 },
    ]),
  ),
  uploadImage: withContentCheck(imageUploadBase.single("image")), // ✅ Ahora también en memoria
};
