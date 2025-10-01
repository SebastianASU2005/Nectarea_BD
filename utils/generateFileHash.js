const fs = require("fs").promises;
const path = require("path");
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
    // filePath contiene la URL generada, necesitamos la ruta absoluta del sistema de archivos.
    const fileName = path.basename(filePath);
    // Asume que 'uploads' está en el directorio raíz del proyecto (process.cwd())
    const fullPath = path.join(process.cwd(), "uploads", fileName);
    
    const fileBuffer = await fs.readFile(fullPath);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
  } catch (error) {
    console.error(`Error al generar el hash para ${filePath}:`, error.message); 
    throw new Error(
      "El archivo físico asociado no se pudo verificar (o no existe)."
    );
  }
};

module.exports = { generateFileHash };
