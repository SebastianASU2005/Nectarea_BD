// services/storage/LocalStorageProvider.js
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 🔒 HARDENING: comparar contra "uploads" + separador. Con solo startsWith(UPLOADS_DIR), una ruta
// como "../uploads_x/archivo" (carpeta hermana con el mismo prefijo) pasaría la validación.
const isInsideUploads = (absolutePath) =>
  absolutePath === UPLOADS_DIR || absolutePath.startsWith(UPLOADS_DIR + path.sep);

class LocalStorageProvider {
  calculateHashFromBuffer(buffer) {
    if (!buffer || !(buffer instanceof Buffer)) {
      throw new Error("El contenido debe ser un Buffer válido.");
    }
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  async saveFile(buffer, relativeFilePath) {
    const safePath = path.normalize(relativeFilePath);
    const absoluteFilePath = path.join(UPLOADS_DIR, safePath);
    if (!isInsideUploads(absoluteFilePath)) {
      throw new Error("Ruta fuera del directorio de subidas.");
    }
    const dir = path.dirname(absoluteFilePath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(absoluteFilePath, buffer);
    return safePath; // ruta relativa
  }

  async getFileStream(relativeFilePath) {
    const absolutePath = path.join(UPLOADS_DIR, relativeFilePath);
    if (!isInsideUploads(absolutePath)) return null;
    if (!fs.existsSync(absolutePath)) return null;
    return fs.createReadStream(absolutePath);
  }

  async getFileUrl(relativeFilePath) {
    // Para desarrollo local, podrías devolver una URL pública servida estáticamente
    // Ej: `http://localhost:3000/uploads/${relativeFilePath}`
    // Para producción con nube, sería la URL directa.
    return `/uploads/${relativeFilePath}`;
  }

  async deleteFile(relativeFilePath) {
    const absolutePath = path.join(UPLOADS_DIR, relativeFilePath);
    if (!isInsideUploads(absolutePath)) return false;
    try {
      await fsp.unlink(absolutePath);
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }

  async fileExists(relativeFilePath) {
    const absolutePath = path.join(UPLOADS_DIR, relativeFilePath);
    if (!isInsideUploads(absolutePath)) return false;
    return fs.existsSync(absolutePath);
  }

  async calculateHashFromFile(relativeFilePath) {
    const absolutePath = path.join(UPLOADS_DIR, relativeFilePath);
    if (!isInsideUploads(absolutePath)) {
      throw new Error("Acceso denegado");
    }
    const buffer = await fsp.readFile(absolutePath);
    return this.calculateHashFromBuffer(buffer);
  }
}

module.exports = LocalStorageProvider;
