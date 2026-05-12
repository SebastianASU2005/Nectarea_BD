// services/storage/index.js
const LocalStorageProvider = require("./LocalStorageProvider");

// En el futuro, si pones STORAGE_PROVIDER=cloudinary en .env:
// const CloudinaryProvider = require("./CloudinaryProvider");

const providerName = process.env.STORAGE_PROVIDER || "local";

let provider;
if (providerName === "local") {
  provider = new LocalStorageProvider();
  console.log("📁 Usando almacenamiento LOCAL");
} else if (providerName === "cloudinary") {
  // provider = new CloudinaryProvider();
  console.log("☁️ Usando almacenamiento en Cloudinary");
} else {
  throw new Error(`Proveedor de almacenamiento desconocido: ${providerName}`);
}

module.exports = provider;