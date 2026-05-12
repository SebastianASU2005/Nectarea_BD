// services/storage/StorageProvider.js
/**
 * @interface StorageProvider
 * Métodos que deben implementar todos los proveedores.
 */
class StorageProvider {
  async saveFile(buffer, relativePath) { throw new Error("Not implemented"); }
  async getFileStream(relativePath) { throw new Error("Not implemented"); }
  async getFileUrl(relativePath) { throw new Error("Not implemented"); }
  async deleteFile(relativePath) { throw new Error("Not implemented"); }
  async fileExists(relativePath) { throw new Error("Not implemented"); }
  calculateHashFromBuffer(buffer) { throw new Error("Not implemented"); }
  async calculateHashFromFile(relativePath) { throw new Error("Not implemented"); }
}
module.exports = StorageProvider;