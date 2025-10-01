const express = require("express");
const app = express();
const PORT = 3000;
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Carga las variables de entorno
require('dotenv').config(); 

// ===============================================
// 1. VERIFICACIÓN DE VARIABLES DE ENTORNO CRÍTICAS
// ===============================================
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const HOST_URL = process.env.HOST_URL;

if (!MP_ACCESS_TOKEN || !HOST_URL) {
    console.error("=========================================================================");
    console.error("  ERROR CRÍTICO: Las variables MP_ACCESS_TOKEN y HOST_URL deben estar configuradas.");
    console.error("  El servicio de pagos NO funcionará.");
    console.error("=========================================================================");
    // No salimos del proceso aquí, solo mostramos el error, 
    // pero si lo estás usando en producción, ¡deberías salir!
}


// Middleware para parsear el cuerpo de las peticiones JSON
app.use(express.json());

// --- CRUCIAL: SERVIR ARCHIVOS ESTÁTICOS ---
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Importa la conexión a la base de datos
const { sequelize } = require("./config/database");

// Crea el directorio de uploads si no existe
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configura multer para guardar archivos en el directorio 'uploads'
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
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
const Pago = require("./models/pago");
const Mensaje = require("./models/mensaje");
const CuotaMensual = require("./models/CuotaMensual");
const ResumenCuenta = require("./models/resumen_cuenta");
const PagoMercado = require("./models/pagoMercado");
const Contrato =require("./models/contrato");
const SuscripcionProyecto = require("./models/suscripcion_proyecto");

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
const contratoRoutes = require("./routes/contrato.routes");
const suscripcionProyectoRoutes = require("./routes/suscripcion_proyecto.routes");
const pagoRoutes = require("./routes/pago.routes");
const authRoutes = require("./routes/auth.routes");
const mensajeRoutes = require("./routes/mensaje.routes");
const cuotaMensualRoutes = require("./routes/cuota_mensual.routes");
const resumenCuentaRoutes = require("./routes/resumen_cuenta.routes");
const pagoMercadoRoutes = require("./routes/pagoMercado.routes");

const paymentReminderScheduler = require("./tasks/paymentReminderScheduler");

// Importación de las tareas programadas
const monthlyPaymentGenerationTask = require("./tasks/monthlyPaymentGenerationTask");
const overduePaymentManager = require("./tasks/OverduePaymentManager");
const overduePaymentNotifier = require("./tasks/OverduePaymentNotifier");

// Usar el router para las rutas de la API, separando la lógica
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/inversiones", inversionRoutes);
app.use("/api/lotes", loteRoutes);
app.use("/api/proyectos", proyectoRoutes);
app.use("/api/pujas", pujaRoutes);
app.use("/api/imagenes", imagenRoutes);
app.use("/api/transacciones", transaccionRoutes);
app.use("/api/contratos", contratoRoutes);
app.use("/api/suscripciones", suscripcionProyectoRoutes);
app.use("/api/pagos", pagoRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/mensajes", mensajeRoutes);
app.use("/api/cuotas_mensuales", cuotaMensualRoutes);
app.use("/api/resumen-cuentas", resumenCuentaRoutes);
app.use("/api/payment", pagoMercadoRoutes); // USO DE LA NUEVA RUTA DE PAGOS DE PASARELA

// Función asincrónica para sincronizar la base de datos
async function synchronizeDatabase() {
  try {
    // Sincronizar todas las tablas. (El orden es importante por las claves foráneas)
    await Usuario.sync({ alter: true });
    await Proyecto.sync({ alter: true });
    await Lote.sync({ alter: true });
    await SuscripcionProyecto.sync({ alter: true });
    await CuotaMensual.sync({ alter: true });
    await ResumenCuenta.sync({ alter: true });
    await Mensaje.sync({ alter: true });
    await Puja.sync({ alter: true }); 
    await Inversion.sync({ alter: true }); 

    // Tablas dependientes del flujo de pago/inversión
    if (typeof PagoMercado !== "undefined") {
      await PagoMercado.sync({ alter: true });
    }

    await Pago.sync({ alter: true }); 
    await Transaccion.sync({ alter: true }); 

    // Otras tablas dependientes
    await Imagen.sync({ alter: true });
    await Contrato.sync({ alter: true });

    console.log("¡Base de datos y relaciones sincronizadas correctamente!");
    
    // Iniciar las tareas programadas y el servidor solo después de la sincronización
    paymentReminderScheduler.scheduleJobs();
    monthlyPaymentGenerationTask.start();
    overduePaymentManager.start();
    overduePaymentNotifier.start();

    app.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Error al sincronizar la base de datos:", error);
    process.exit(1);
  }
}

// Llama a la función para iniciar el proceso de sincronización
synchronizeDatabase();
