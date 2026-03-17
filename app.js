// Archivo: app.js (CORREGIDO)

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;
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
    "=========================================================================",
  );
  console.error(
    "       ERROR CRÍTICO: Las variables MP_ACCESS_TOKEN y HOST_URL deben estar configuradas.",
  );
  console.error("       El servicio de pagos NO funcionará.");
  console.error(
    "=========================================================================",
  );
}
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1); // Confiar en el primer proxy (Render)
  console.log("✅ Trust proxy habilitado para producción");
} else {
  app.set("trust proxy", false); // No confiar en proxies en desarrollo
  console.log("⚠️ Trust proxy deshabilitado (desarrollo local)");
}

// 🚨 FUNCIÓN CRÍTICA PARA CAPTURAR EL CUERPO RAW (SIN PARSEAR)
function captureRawBody(req, res, buf, encoding) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || "utf8");
  }
}

// ====================================================================
// 2. MIDDLEWARES GLOBALES BÁSICOS (SIN BODY PARSING AÚN)
// ====================================================================
const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? process.env.FRONTEND_URL
      : "http://localhost:5173",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

// --- CRUCIAL: SERVIR ARCHIVOS ESTÁTICOS ---
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Importa la conexión a la base de datos
const { sequelize } = require("./config/database");

// ✅ NUEVO: Importar rate limiters
const {
  initRateLimiters,
  globalRateLimiter,
} = require("./middleware/rateLimiter");

// --- Configuración básica de Multer para la subida de archivos ---
const IMAGENES_DIR_PUBLIC = path.join(__dirname, "uploads", "imagenes");

if (!fs.existsSync(IMAGENES_DIR_PUBLIC)) {
  fs.mkdirSync(IMAGENES_DIR_PUBLIC, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/imagenes/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});
const upload = multer({ storage: storage });

// ====================================================================
// 3. IMPORTACIÓN DE MODELOS (CRÍTICO)
// ====================================================================

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
const VerificacionIdentidad = require("./models/verificacion_identidad");
const ContratoPlantilla = require("./models/ContratoPlantilla");
const ContratoFirmado = require("./models/ContratoFirmado");

const configureAssociations = require("./models/associations");

// ====================================================================
// 4. IMPORTACIÓN DE RUTAS
// ====================================================================

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
const developerRoutes = require("./routes/developer.routes");
const pagoRoutes = require("./routes/pago.routes");
const authRoutes = require("./routes/auth.routes");
const mensajeRoutes = require("./routes/mensaje.routes");
const cuotaMensualRoutes = require("./routes/cuota_mensual.routes");
const resumenCuentaRoutes = require("./routes/resumen_cuenta.routes");
const pagoMercadoRoutes = require("./routes/pagoMercado.routes");
const redireccionRoutes = require("./routes/redireccion.routes");
const testRoutes = require("./routes/test.routes");
const favoritoRoutes = require("./routes/favorito.routes");
const kycRoutes = require("./routes/kyc.routes");

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
// 5. 🔥 CONFIGURACIÓN DE RUTAS EN ORDEN ESPECÍFICO
// ====================================================================

// 5.1. WEBHOOK (DEBE IR PRIMERO POR EL RAW BODY)
// No le aplicamos rate limiting — el skip en globalRateLimiter ya lo excluye.
const webhookRouter = express.Router();
webhookRouter.use(
  express.json({ verify: captureRawBody }),
  express.urlencoded({ extended: true, verify: captureRawBody }),
);
webhookRouter.post("/:metodo", paymentController.handleWebhook);
app.use("/api/payment/webhook", webhookRouter);

// --------------------------------------------------------------------
// 5.2. 🔥 BODY PARSING GLOBAL
// --------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log("✅ Body parsing global activado");

// ✅ NUEVO: RATE LIMITER GLOBAL (justo después del body parsing, antes de rutas)
// Bloquea IPs abusivas (> 100 req/min) antes de que lleguen a cualquier controlador.
// El webhook de MercadoPago queda automáticamente excluido vía skip interno.
app.use(globalRateLimiter);

console.log("✅ Rate limiter global activado");

// --------------------------------------------------------------------
// 5.3. 🔥 RUTAS DE LA API
// --------------------------------------------------------------------

app.use("/api/kyc", (req, res, next) => {
  console.log(`\n🔍 PETICIÓN KYC: ${req.method} ${req.url}`);
  console.log("📍 Content-Type:", req.get("content-type"));
  next();
});

app.use("/api/kyc", kycRoutes);
app.use("/api/contratos", contratoRoutes);
app.use("/api/imagenes", imagenRoutes);

app.use("/api/usuarios", usuarioRoutes);
app.use("/api/inversiones", inversionRoutes);
app.use("/api/lotes", loteRoutes);
app.use("/api/proyectos", proyectoRoutes);
app.use("/api/pujas", pujaRoutes);
app.use("/api/transacciones", transaccionRoutes);
app.use("/api/suscripciones", suscripcionProyectoRoutes);
app.use("/api/developer", developerRoutes);
app.use("/api/suscripcionesCanceladas", suscripcionRoutes);
app.use("/api/pagos", pagoRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/mensajes", mensajeRoutes);
app.use("/api/cuotas_mensuales", cuotaMensualRoutes);
app.use("/api/resumen-cuentas", resumenCuentaRoutes);
app.use("/api/test", testRoutes);
app.use("/api/favoritos", favoritoRoutes);

app.use("/api/payment", pagoMercadoRoutes);
app.use(redireccionRoutes);

// ====================================================================
// 6. SINCRONIZACIÓN DE BASE DE DATOS E INICIO DEL SERVIDOR (CRÍTICO)
// ====================================================================

async function synchronizeDatabase() {
  try {
    // ==========================================================
    // FASE 1: Creación inicial de las tablas (solo columnas)
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
    await ContratoPlantilla.sync({ alter: true });
    await ContratoFirmado.sync({ alter: true });
    await Favorito.sync({ alter: true });
    await VerificacionIdentidad.sync({ alter: true });

    // ==========================================================
    // ASOCIACIONES
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
    await ContratoPlantilla.sync({ alter: true });
    await ContratoFirmado.sync({ alter: true });
    await Favorito.sync({ alter: true });
    await VerificacionIdentidad.sync({ alter: true });

    console.log("¡Base de datos y relaciones sincronizadas correctamente!");

    // ✅ NUEVO: Inicializar rate limiters DESPUÉS de que la DB esté lista.
    // Crea automáticamente las tablas rate_limit_global_ip, rate_limit_user_default
    // y rate_limit_user_premium en tu base de datos PostgreSQL.
    await initRateLimiters();

    // ==========================================================
    // INICIO DE TAREAS PROGRAMADAS (CRON JOBS)
    // ==========================================================
    paymentReminderScheduler.scheduleJobs();
    monthlyPaymentGenerationTask.start();
    overduePaymentManager.start();
    overduePaymentNotifier.start();
    cleanupUnconfirmedUsersTask.start();
    initAuctionScheduler();
    startCronJobs();
    iniciarCronJobExpiracion();
    subscriptionCheckScheduler.scheduleJobs();

    // Inicia el servidor de Express
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor escuchando en puerto ${PORT}`);
      console.log("=".repeat(70));
      console.log("📋 ORDEN DE MIDDLEWARES CONFIGURADO:");
      console.log("   1. CORS");
      console.log("   2. Archivos estáticos (/uploads)");
      console.log("   3. Webhook (con raw body) — excluido del rate limit");
      console.log("   4. Body parsing global (express.json)");
      console.log("   5. ✅ Rate limiter global (100 req/min por IP)");
      console.log("   6. Rutas con Multer (KYC, Contratos, Imágenes)");
      console.log("   7. Resto de rutas de la API");
      console.log("=".repeat(70));
    });
  } catch (error) {
    console.error("Error al sincronizar la base de datos:", error);
    process.exit(1);
  }
}

synchronizeDatabase();
