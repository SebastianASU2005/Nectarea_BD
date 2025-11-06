// services/localFileStorageService.js

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

// Directorio base donde se guardarán todos los archivos
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// ------------------------------------------------------------------
// 1. FUNCIONES DE HASH (Integración de tu generateFileHash)
// ------------------------------------------------------------------

/**
 * @function calculateHashFromBuffer
 * @description Calcula el Hash (SHA-256) directamente desde un Buffer binario (archivo en memoria).
 * @param {Buffer} buffer - El contenido binario del archivo.
 * @returns {string} El hash SHA-256 en formato hexadecimal.
 */
function calculateHashFromBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * @function calculateHashFromFile
 * @description Calcula el Hash (SHA-256) de un archivo ya guardado en el disco.
 * @param {string} relativePath - La ruta relativa guardada en la DB (ej: /uploads/kyc/archivo.jpg).
 * @returns {Promise<string>} El hash SHA-256 del archivo.
 * @throws {Error} Si el archivo no existe o no se puede leer.
 */
async function calculateHashFromFile(relativePath) {
  try {
    // La ruta guardada en DB es: /uploads/ruta/archivo.ext
    // path.relative(path.join(UPLOAD_DIR, '..'), relativePath) -> obtiene la parte después de /uploads
    const fileName = path.basename(relativePath);

    // Construye la ruta absoluta
    const fullPath = path.join(UPLOAD_DIR, "..", relativePath);

    // Lee el archivo completo en un Buffer.
    const fileBuffer = await fs.readFile(fullPath);

    // Calcula el hash
    return calculateHashFromBuffer(fileBuffer);
  } catch (error) {
    console.error(
      `Error al verificar integridad del archivo en disco (${relativePath}):`,
      error.message
    );
    throw new Error(
      "El archivo físico asociado no se pudo verificar (o no existe)."
    );
  }
}

// ------------------------------------------------------------------
// 2. FUNCIONES DE ALMACENAMIENTO (Como se definió anteriormente)
// ------------------------------------------------------------------

const localFileStorageService = {
  async ensureUploadDirectory() {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  },

  /**
   * @async
   * @function uploadBuffer
   * @description Guarda un buffer de archivo en el disco local.
   * @param {Buffer} buffer - El contenido binario del archivo.
   * @param {string} relativePath - Ruta y nombre de archivo relativo (ej: 'contratos/2025/123.pdf').
   * @returns {Promise<string>} La RUTA RELATIVA (/uploads/...) donde se guardó el archivo.
   */
  async uploadBuffer(buffer, relativePath) {
    await this.ensureUploadDirectory();

    // Aseguramos que la ruta a guardar tenga un prefijo para fácil acceso
    const cleanRelativePath = path.join(relativePath);
    const filePath = path.join(UPLOAD_DIR, cleanRelativePath);

    // Asegura que el subdirectorio exista
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    await fs.writeFile(filePath, buffer);

    // Retorna la ruta relativa completa para ser guardada en la DB
    return path.join("/uploads", cleanRelativePath);
  },

  /**
   * @async
   * @function uploadMultipleKYCFiles
   * @description Sube múltiples archivos del formulario KYC (se mantiene la lógica anterior).
   * @param {number} userId - ID del usuario.
   * @param {object} files - Objeto de archivos subidos por Multer.
   * @returns {Promise<object>} Objeto con las rutas locales de los archivos subidos.
   */
  async uploadMultipleKYCFiles(userId, files) {
    const fileRoutes = {};
    const baseFolder = `kyc/${userId}`;

    await this.ensureUploadDirectory();

    const uploadPromises = Object.keys(files).map(async (field) => {
      const file = files[field][0];
      if (file) {
        const extension = path.extname(file.originalname);
        const relativePath = `${baseFolder}/${field}-${Date.now()}${extension}`;

        // Guardar el buffer en el disco
        const localPath = await this.uploadBuffer(file.buffer, relativePath);

        fileRoutes[field] = localPath;
      }
    });

    await Promise.all(uploadPromises);
    return fileRoutes;
  },

  // Exportar ambas funciones de hash para su uso externo
  calculateHashFromBuffer: calculateHashFromBuffer,
  calculateHashFromFile: calculateHashFromFile, // Usado en ContratoPlantillaService
};

module.exports = localFileStorageService;
