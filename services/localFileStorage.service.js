// services/localFileStorage.service.js
const fs = require("fs");
const fsp = require("fs/promises"); // 💡 MEJORA: Módulo de promesas para fs
const path = require("path");
const crypto = require("crypto");

const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

// Asegurar que el directorio base de subidas exista al iniciar el servicio.
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const localFileStorageService = {
  /**
   * @function calculateHashFromBuffer
   * @description Calcula el hash SHA-256 de un Buffer. (Sin cambios, es robusto)
   */
  calculateHashFromBuffer(buffer) {
    if (!buffer || !(buffer instanceof Buffer)) {
      throw new Error(
        "El contenido debe ser un Buffer válido para calcular el hash."
      );
    }
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }
  /**
   * @async
   * @function uploadBuffer
   * @description Guarda un Buffer en el sistema de archivos local de forma segura.
   * 💡 MEJORADO: Uso de fs/promises y prevención de Path Traversal.
   */,

  async uploadBuffer(buffer, relativeFilePath) {
    // 1. Prevenir Path Traversal
    const safePath = path.normalize(relativeFilePath);
    const absoluteFilePath = path.join(UPLOADS_DIR, safePath); // Verificar que la ruta final esté contenida en UPLOADS_DIR
    if (!absoluteFilePath.startsWith(UPLOADS_DIR)) {
      throw new Error(
        "Ruta de archivo no válida o fuera del directorio de subidas."
      );
    }

    const dir = path.dirname(absoluteFilePath);

    try {
      // 2. Crear directorios recursivamente (usando fs/promises)
      await fsp.mkdir(dir, { recursive: true }); // 3. Escribir el archivo (usando fs/promises)
      await fsp.writeFile(absoluteFilePath, buffer); // Devolvemos la ruta relativa limpia (safePath)
      return safePath;
    } catch (err) {
      console.error("Error al guardar el archivo:", err);
      throw new Error(
        "Fallo al guardar el archivo en el almacenamiento local."
      );
    }
  }
  /**
   * @function calculateHashFromFile
   * @description Lee un archivo desde disco y calcula su hash. (Sincrónico para integridad inmediata)
   */,

  calculateHashFromFile(relativeFilePath) {
    try {
      const absolutePath = path.join(UPLOADS_DIR, relativeFilePath); // Asegurar la ruta contra '..' antes de leer
      if (!absolutePath.startsWith(UPLOADS_DIR)) {
        throw new Error(
          "Acceso a archivo fuera del directorio de subidas denegado."
        );
      }
      const fileBuffer = fs.readFileSync(absolutePath);
      return this.calculateHashFromBuffer(fileBuffer);
    } catch (error) {
      console.error(
        `Error al leer el archivo para hashing: ${relativeFilePath}`,
        error
      );
      throw new Error(
        `El archivo de integridad no existe o es ilegible: ${error.message}`
      );
    }
  }
  /**
   * @async
   * @function deleteFileAsync
   * @description Elimina un archivo del sistema local de forma asíncrona.
   * 💡 NUEVA FUNCIÓN: Mejor para entornos de alto rendimiento.
   */,
  async deleteFileAsync(relativeFilePath) {
    const absolutePath = path.join(UPLOADS_DIR, relativeFilePath); // Prevenir Path Traversal en la eliminación

    if (!absolutePath.startsWith(UPLOADS_DIR)) {
      console.warn(
        `Intento de eliminar archivo fuera del directorio de subidas: ${relativeFilePath}`
      );
      return false;
    }
    try {
      await fsp.unlink(absolutePath);
      return true;
    } catch (error) {
      if (error.code === "ENOENT") {
        // El archivo ya no existe, éxito "virtual"
        return false;
      }
      console.error(`Error al eliminar archivo ${relativeFilePath}:`, error);
      throw new Error(`Fallo al eliminar el archivo: ${error.message}`);
    }
  }
  /**
   * @function deleteFile
   * @description Elimina un archivo del sistema local (versión sincrónica, mantenida por compatibilidad).
   */,

  deleteFile(relativeFilePath) {
    const absolutePath = path.join(UPLOADS_DIR, relativeFilePath); // Prevenir Path Traversal
    if (!absolutePath.startsWith(UPLOADS_DIR)) {
      return false;
    }
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      return true;
    }
    return false;
  }
  /**
   * @function fileExists
   * @description Verifica si un archivo existe. (Sin cambios)
   */,

  fileExists(relativeFilePath) {
    const absolutePath = path.join(UPLOADS_DIR, relativeFilePath); // Prevenir Path Traversal
    if (!absolutePath.startsWith(UPLOADS_DIR)) {
      return false;
    }

    return fs.existsSync(absolutePath);
  },
};

module.exports = localFileStorageService;
