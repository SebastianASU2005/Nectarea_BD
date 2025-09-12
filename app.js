const express = require("express");
const app = express();
const PORT = 3000;
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Middleware para parsear el cuerpo de las peticiones JSON
app.use(express.json());

// Importa la conexión a la base de datos
const { sequelize } = require("./config/database");

// Crea el directorio de uploads si no existe
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configura multer para guardar archivos en el directorio 'uploads'
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Importa todos los modelos para que Sequelize los conozca
const Usuario = require("./models/usuario");
const Inversion = require("./models/inversion");
const Lote = require("./models/lote");
const Proyecto = require("./models/proyecto");
const Puja = require("./models/puja");
const Transaccion = require("./models/transaccion");
const Imagen = require("./models/imagen");
const Contrato = require('./models/contrato');
const SuscripcionProyecto = require('./models/suscripcion_proyecto');

// Importa la función de asociaciones
const configureAssociations = require("./models/associations");

// Ejecuta la función para definir todas las relaciones entre los modelos
configureAssociations();

// Importa los archivos de rutas para cada modelo
const usuarioRoutes = require("./routes/usuario.routes");
const inversionRoutes = require("./routes/inversion.routes");
const loteRoutes = require("./routes/lote.routes");
const proyectoRoutes = require("./routes/proyecto.routes");
const pujaRoutes = require("./routes/puja.routes");
const imagenRoutes = require("./routes/imagen.routes");
const transaccionRoutes = require("./routes/transaccion.routes");
const contratoRoutes = require('./routes/contrato.routes');
const suscripcionProyectoRoutes = require('./routes/suscripcion_proyecto.routes');

// Usar el router para las rutas de la API, separando la lógica
app.use("/usuarios", usuarioRoutes);
app.use("/inversiones", inversionRoutes);
app.use("/lotes", loteRoutes);
app.use("/proyectos", proyectoRoutes);
app.use("/pujas", pujaRoutes);
app.use("/imagenes", imagenRoutes);
app.use("/transacciones", transaccionRoutes);
app.use("/contratos", contratoRoutes);
app.use("/suscripciones", suscripcionProyectoRoutes);

// Sincroniza todos los modelos con la base de datos
sequelize.sync({ alter: true })
  .then(() => {
    console.log("¡Base de datos y relaciones sincronizadas correctamente!");
    // Inicia el servidor solo si la base de datos se sincronizó con éxito
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Error al sincronizar la base de datos:", error);
  });