const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Directorio específico para imágenes
const uploadDir = path.join(__dirname, '..', 'uploads', 'imagenes');

// Asegurar que el directorio de subida existe. ¡Importante!
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Guarda los archivos en la carpeta 'uploads/imagenes'
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Genera un nombre de archivo único para evitar colisiones
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // Usa el nombre del campo más el sufijo único y la extensión original
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Filtro estricto para aceptar solo IMÁGENES
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        // Rechazar archivos no imagen
        cb(new Error('Solo se permiten archivos de imagen (JPEG, PNG, etc.).'), false);
    }
};

// Configuración de Multer para imágenes
const imageUpload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB límite por archivo de imagen
    }
});

// Exportamos el middleware configurado
module.exports = imageUpload;
