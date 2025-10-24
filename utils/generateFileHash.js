// Importa la versión de promesas del módulo 'fs' para usar async/await
const fs = require("fs").promises;
// Módulo para trabajar con rutas de archivos y directorios
const path = require("path");
// Módulo para operaciones criptográficas, incluyendo la creación de hashes
const crypto = require("crypto");

/**
 * @function generateFileHash
 * @description Calcula el Hash (SHA-256) de un archivo físico en la carpeta de uploads.
 * @param {string} filePath - La URL o ruta relativa (e.g., /uploads/filename.pdf) del archivo.
 * @returns {Promise<string>} El hash SHA-256 del archivo.
 * @throws {Error} Si el archivo no existe o no se puede leer.
 */
const generateFileHash = async (filePath) => {
  try {
    // 1. Extrae solo el nombre del archivo de la ruta/URL proporcionada.
    const fileName = path.basename(filePath);

    // 2. Construye la ruta absoluta al archivo.
    // Se asume que la carpeta 'uploads' está en la raíz del proyecto (donde se ejecuta el script).
    const fullPath = path.join(process.cwd(), "uploads", fileName);

    // 3. Lee el archivo completo en un Buffer.
    const fileBuffer = await fs.readFile(fullPath);

    // 4. Calcula el hash SHA-256 del Buffer y lo devuelve en formato hexadecimal.
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
  } catch (error) {
    // Captura cualquier error de lectura de archivo o generación de hash.
    console.error(`Error al generar el hash para ${filePath}:`, error.message);

    // Lanza un error genérico y seguro para el consumidor de la función.
    throw new Error(
      "El archivo físico asociado no se pudo verificar (o no existe)."
    );
  }
};

// Exporta la función para que pueda ser utilizada en otros módulos
module.exports = { generateFileHash };
