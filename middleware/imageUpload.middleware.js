const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Directorio específico para imágenes: './uploads/imagenes' en la raíz del proyecto
const uploadDir = path.join(__dirname, "..", "uploads", "imagenes");

// Asegurar que el directorio de subida existe. ¡Crítico para evitar errores de escritura!
if (!fs.existsSync(uploadDir)) {
  // Si no existe, se crea el directorio y todos los subdirectorios necesarios (recursive: true).
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Configuración del almacenamiento en disco para Multer.
 * Define dónde guardar el archivo y cómo nombrarlo.
 */
const storage = multer.diskStorage({
  /**
   * @description Define el directorio de destino para los archivos subidos.
   */
  destination: (req, file, cb) => {
    // Guarda los archivos en la carpeta 'uploads/imagenes'
    cb(null, uploadDir);
  },
  /**
   * @description Define la función para generar el nombre único del archivo.
   */
  filename: (req, file, cb) => {
    // Genera un sufijo único (timestamp + número aleatorio) para evitar colisiones.
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // Usa el nombre del campo (ej: 'avatar') + sufijo único + extensión original del archivo.
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

/**
 * @description Filtro estricto para aceptar solo archivos que comiencen con 'image/'.
 * @param {object} req - Objeto de solicitud.
 * @param {object} file - Objeto del archivo que se está subiendo.
 * @param {function} cb - Callback de Multer.
 */
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    // Aceptar el archivo
    cb(null, true);
  } else {
    // Rechazar archivos no imagen, devolviendo un error.
    cb(
      new Error("Solo se permiten archivos de imagen (JPEG, PNG, etc.)."),
      false
    );
  }
};

/**
 * Configuración final de Multer para la subida de imágenes.
 * Define el almacenamiento, el filtro de tipo de archivo y el límite de tamaño.
 */
const imageUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // Limita el tamaño de cada archivo a 5 Megabytes (5MB).
  },
});

// Exportamos el middleware configurado para ser usado en las rutas.
module.exports = imageUpload;
