const express = require("express");
const app = express();
const PORT = 3000;
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
// Importa el controlador de pagos directamente para la ruta del webhook
const paymentController = require("./controllers/pagoMercado.controller");

// Carga las variables de entorno
require("dotenv").config();

// ===============================================
// 1. VERIFICACIÓN DE VARIABLES DE ENTORNO CRÍTICAS
// ===============================================
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const HOST_URL = process.env.HOST_URL;

if (!MP_ACCESS_TOKEN || !HOST_URL) {
  console.error(
    "========================================================================="
  );
  console.error(
    "       ERROR CRÍTICO: Las variables MP_ACCESS_TOKEN y HOST_URL deben estar configuradas."
  );
  console.error("       El servicio de pagos NO funcionará.");
  console.error(
    "========================================================================="
  );
}

// 🚨 FUNCIÓN CRÍTICA PARA CAPTURAR EL CUERPO RAW (SIN PARSEAR)
function captureRawBody(req, res, buf, encoding) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || "utf8");
  }
}

// ====================================================================
// 2. MIDDLEWARES GLOBALES (Para el 99% de las rutas de la API)
// ====================================================================
const corsOptions = {
  // Solo permite peticiones desde tu frontend de desarrollo
  origin: "http://localhost:5173",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true, // Esto es crucial si usas cookies o sesiones
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- CRUCIAL: SERVIR ARCHIVOS ESTÁTICOS ---
// Permite acceder a archivos subidos mediante la URL /uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Importa la conexión a la base de datos
const { sequelize } = require("./config/database");

// --- Configuración básica de Multer para la subida de archivos ---

// 🎯 FIX CRÍTICO: Definición del directorio de imágenes para Multer
const IMAGENES_DIR_PUBLIC = path.join(__dirname, "uploads", "imagenes");

// Asegurar que el directorio de subida existe.
if (!fs.existsSync(IMAGENES_DIR_PUBLIC)) {
  fs.mkdirSync(IMAGENES_DIR_PUBLIC, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 🎯 FIX: El destino debe ser la carpeta 'uploads/imagenes/'
    // para ser consistente con el controlador y la ruta pública.
    cb(null, "uploads/imagenes/");
  },
  filename: function (req, file, cb) {
    // Usamos la convención del middleware imageUpload: fieldname-timestamp-random.ext
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});
const upload = multer({ storage: storage }); // Middleware de subida general (si aplica)

// Importa todos los modelos para que Sequelize los conozca antes de configurar asociaciones
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
const Contrato = require("./models/contrato");
const SuscripcionProyecto = require("./models/suscripcion_proyecto");
const SuscripcionCancelada = require("./models/suscripcion_cancelada");
const Favorito = require("./models/Favorito");

// Importa la función de asociaciones
const configureAssociations = require("./models/associations");

// Importa los archivos de rutas para cada módulo
const usuarioRoutes = require("./routes/usuario.routes");
const inversionRoutes = require("./routes/inversion.routes");
const loteRoutes = require("./routes/lote.routes");
const proyectoRoutes = require("./routes/proyecto.routes");
const pujaRoutes = require("./routes/puja.routes");
const imagenRoutes = require("./routes/imagen.routes");
const transaccionRoutes = require("./routes/transaccion.routes");
const contratoRoutes = require("./routes/contrato.routes");
const suscripcionProyectoRoutes = require("./routes/suscripcion_proyecto.routes");
const suscripcionRoutes = require("./routes/suscripcion.routes");
const pagoRoutes = require("./routes/pago.routes");
const authRoutes = require("./routes/auth.routes");
const mensajeRoutes = require("./routes/mensaje.routes");
const cuotaMensualRoutes = require("./routes/cuota_mensual.routes");
const resumenCuentaRoutes = require("./routes/resumen_cuenta.routes");
const pagoMercadoRoutes = require("./routes/pagoMercado.routes");
const redireccionRoutes = require("./routes/redireccion.routes");
const testRoutes = require("./routes/test.routes");
const favoritoRoutes = require("./routes/favorito.routes");

// Importación de las tareas programadas (CRON JOBS)
const paymentReminderScheduler = require("./tasks/paymentReminderScheduler");
const monthlyPaymentGenerationTask = require("./tasks/monthlyPaymentGenerationTask");
const overduePaymentManager = require("./tasks/OverduePaymentManager");
const overduePaymentNotifier = require("./tasks/OverduePaymentNotifier");
const cleanupUnconfirmedUsersTask = require("./tasks/cleanupUnconfirmedUsersTask");
const { startCronJobs } = require("./tasks/ManejoImpagoPuja");
const { initAuctionScheduler } = require("./tasks/auctionSchedulerTask");
const {
  iniciarCronJobExpiracion,
} = require("./tasks/expireOldTransactions.job");
const subscriptionCheckScheduler = require("./tasks/subscriptionCheckScheduler");

// ====================================================================
// 3. RUTAS DEL WEBHOOK (USANDO ROUTER DEDICADO PARA MIDDLEWARE RAW) 🎯
// ====================================================================
const webhookRouter = express.Router();

// 🚨 Middleware Específico para el webhook que captura el cuerpo RAW
webhookRouter.use(
  express.json({ verify: captureRawBody }),
  express.urlencoded({ extended: true, verify: captureRawBody })
);

// La ruta de webhook se define dentro del router
webhookRouter.post("/:metodo", paymentController.handleWebhook);

// Aplicar el router SOLO a la ruta base del webhook
app.use("/api/payment/webhook", webhookRouter);

console.log(
  "✅ Ruta de webhook configurada: POST /api/payment/webhook/:metodo"
);

// ====================================================================
// 4. OTRAS RUTAS DE LA API (CON AUTENTICACIÓN)
// ====================================================================
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/inversiones", inversionRoutes);
app.use("/api/lotes", loteRoutes);
app.use("/api/proyectos", proyectoRoutes);
app.use("/api/pujas", pujaRoutes);
app.use("/api/imagenes", imagenRoutes);
app.use("/api/transacciones", transaccionRoutes);
app.use("/api/contratos", contratoRoutes);
app.use("/api/suscripciones", suscripcionProyectoRoutes);
app.use("/api/suscripcionesCanceladas", suscripcionRoutes);
app.use("/api/pagos", pagoRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/mensajes", mensajeRoutes);
app.use("/api/cuotas_mensuales", cuotaMensualRoutes);
app.use("/api/resumen-cuentas", resumenCuentaRoutes);
app.use("/api/test", testRoutes);
app.use("/api/favoritos", favoritoRoutes);

// 5. RUTAS DE PAGO (AUTENTICADAS) - SIN EL WEBHOOK
app.use("/api/payment", pagoMercadoRoutes);

// 6. RUTAS DE REDIRECCIÓN (PÁGINAS DE RESULTADO DE PAGO)
app.use(redireccionRoutes);

/**
 * @async
 * @function synchronizeDatabase
 * @description Conecta y sincroniza la base de datos en dos fases para garantizar
 * que todas las tablas existan antes de configurar las claves foráneas.
 */
async function synchronizeDatabase() {
  try {
    // ==========================================================
    // FASE 1: Creación inicial de las tablas (solo columnas)
    // ==========================================================
    // Sincroniza todos los modelos para asegurar que las tablas existen
    await Usuario.sync({ alter: true });
    await Proyecto.sync({ alter: true });
    await Lote.sync({ alter: true });
    await SuscripcionProyecto.sync({ alter: true });
    await SuscripcionCancelada.sync({ alter: true });
    await CuotaMensual.sync({ alter: true });
    await ResumenCuenta.sync({ alter: true });
    await Mensaje.sync({ alter: true });
    await Puja.sync({ alter: true });
    await Inversion.sync({ alter: true });
    await Pago.sync({ alter: true });
    await PagoMercado.sync({ alter: true });
    await Transaccion.sync({ alter: true });
    await Imagen.sync({ alter: true });
    await Contrato.sync({ alter: true });
    await Favorito.sync({ alter: true });

    // ==========================================================
    // 🎯 FIX CRÍTICO: Definimos las asociaciones AQUÍ
    // ==========================================================
    configureAssociations();

    // ==========================================================
    // FASE 2: Sincronización para añadir las Claves Foráneas (FKs)
    // ==========================================================
    await Usuario.sync({ alter: true });
    await Proyecto.sync({ alter: true });
    await Lote.sync({ alter: true });
    await SuscripcionProyecto.sync({ alter: true });
    await SuscripcionCancelada.sync({ alter: true });
    await CuotaMensual.sync({ alter: true });
    await ResumenCuenta.sync({ alter: true });
    await Mensaje.sync({ alter: true });
    await Puja.sync({ alter: true });
    await Inversion.sync({ alter: true });
    await Pago.sync({ alter: true });
    await PagoMercado.sync({ alter: true });
    await Transaccion.sync({ alter: true });
    await Imagen.sync({ alter: true });
    await Contrato.sync({ alter: true });
    await Favorito.sync({ alter: true });

    console.log("¡Base de datos y relaciones sincronizadas correctamente!");

    // ==========================================================
    // 🚀 INICIO DE TAREAS PROGRAMADAS (CRON JOBS)
    // ==========================================================
    paymentReminderScheduler.scheduleJobs();
    monthlyPaymentGenerationTask.start();
    overduePaymentManager.start();
    overduePaymentNotifier.start();
    cleanupUnconfirmedUsersTask.start();
    initAuctionScheduler(); // ⬅️ Tu scheduler de inicio/fin de subastas
    startCronJobs(); // ⬅️ El otro scheduler de manejo de impagos de pujas
    iniciarCronJobExpiracion();
    subscriptionCheckScheduler.scheduleJobs();

    // Inicia el servidor de Express
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Error al sincronizar la base de datos:", error);
    process.exit(1);
  }
}

// Llama a la función para iniciar el proceso de sincronización y el servidor
synchronizeDatabase();
