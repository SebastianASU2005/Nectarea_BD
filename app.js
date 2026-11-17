// Archivo: app.js (CORREGIDO - TRUST PROXY PARA RAILWAY)
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
// ⚡ ROBUSTEZ DE PROCESO
// ===============================================
// Flags de despliegue (todos opcionales; los valores por defecto mantienen el comportamiento actual):
//   ENABLE_CRON=false            -> no arranca los cron jobs (útil para correrlos en un servicio "worker" aparte)
//   ENABLE_HTTP=false            -> no abre el puerto HTTP (servicio "worker" que solo corre cron jobs)
//   DB_SYNC_ALTER=false          -> en arranque hace sync() sin `alter` (más rápido; úsalo cuando el esquema ya está migrado)
//   SHUTDOWN_TIMEOUT_MS=10000    -> espera máxima para terminar requests en curso al recibir SIGTERM
//   EXIT_ON_UNHANDLED_REJECTION=true -> volver al comportamiento de Node (caer ante una promesa rechazada sin capturar)
const ENABLE_CRON = process.env.ENABLE_CRON !== "false";
const ENABLE_HTTP = process.env.ENABLE_HTTP !== "false";
const SYNC_OPTIONS = process.env.DB_SYNC_ALTER === "false" ? {} : { alter: true };
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 10000;
let shuttingDown = false;
let httpServer = null;

// Node 15+ termina el proceso ante una promesa rechazada sin capturar: un solo `await` sin try/catch
// tiraba abajo la API completa y cortaba todos los requests en curso. Se registra y se sigue.
process.on("unhandledRejection", (reason) => {
  console.error("⚠️ unhandledRejection:", reason);
  if (process.env.EXIT_ON_UNHANDLED_REJECTION === "true") process.exit(1);
});
// Una excepción síncrona sin capturar deja el proceso en estado desconocido: cierre ordenado y salida con error.
process.on("uncaughtException", (err) => {
  console.error("💥 uncaughtException:", err);
  gracefulShutdown("uncaughtException", 1);
});
process.on("SIGTERM", () => gracefulShutdown("SIGTERM", 0));
process.on("SIGINT", () => gracefulShutdown("SIGINT", 0));

// ✅ IMPORTAMOS EL SERVICIO DE EMAIL PARA LAS PRUEBAS
const emailService = require("./services/email.service");

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

// ===============================================
// ✅ CONFIGURACIÓN DE TRUST PROXY (CORREGIDA)
// ===============================================
// En producción (Railway, Render, etc.) siempre hay proxy.
// Activamos trust proxy en cualquier entorno que no sea 'development' local.
if (process.env.NODE_ENV === "development") {
  app.set("trust proxy", false);
  console.log("⚠️ Trust proxy deshabilitado (desarrollo local)");
} else {
  // Railway coloca exactamente 1 proxy delante de la app.
  // El número indica CUÁNTOS saltos confiar, no "confiar en todos".
  app.set("trust proxy", 1);
  console.log("✅ Trust proxy habilitado (1 salto — Railway edge)");
}

// ===============================================
// 🔒 HARDENING: opciones globales de seguridad
// ===============================================
const securityHeaders = require("./middleware/securityHeaders");
const privateUploadsGuard = require("./middleware/privateUploads");
const authMiddlewareGlobal = require("./middleware/auth.middleware");
const { jsonReplacer } = require("./utils/jsonSanitizer");

// No revelar el framework (cabecera X-Powered-By: Express)
app.disable("x-powered-by");

// Nunca serializar secretos (hash de contraseña, secreto 2FA, tokens) en respuestas JSON
// y firmar con vencimiento las URLs de archivos privados (KYC/contratos).
app.set("json replacer", jsonReplacer);

// Cabeceras de seguridad HTTP
app.use(securityHeaders);

// ⚡ Durante el apagado, avisar a los clientes que no reutilicen la conexión (keep-alive).
app.use((req, res, next) => {
  if (shuttingDown) res.setHeader("Connection", "close");
  next();
});

// ⚡ Compresión gzip de las respuestas JSON/texto (los listados pesan MBs). Imágenes/PDF no se
// comprimen (el filtro por defecto solo comprime tipos comprimibles). Si el módulo no está
// instalado (aún no corriste `npm install`), la app arranca igual sin compresión.
let compression = null;
try {
  compression = require("compression");
} catch (e) {
  console.warn("[perf] Módulo 'compression' no instalado: respuestas sin gzip. Ejecuta `npm install`.");
}
if (compression) {
  app.use(compression({ threshold: 1024, level: 4 }));
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
// 🔒 HARDENING: lista blanca de orígenes.
//  - FRONTEND_URL: origen del front (también se usa para armar links en los emails).
//  - CORS_ALLOWED_ORIGINS (opcional): orígenes extra separados por coma
//    (p. ej. dominio definitivo + preview). Sin "/" final y sin rutas.
const normalizeOrigin = (o) => String(o || "").trim().replace(/\/+$/, "");
const allowedOrigins = new Set(
  [
    ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173"]),
    process.env.FRONTEND_URL,
    ...(process.env.CORS_ALLOWED_ORIGINS || "").split(","),
  ]
    .map(normalizeOrigin)
    .filter(Boolean),
);
console.log("🔐 Orígenes CORS permitidos:", [...allowedOrigins].join(", ") || "(ninguno)");

const corsOptions = {
  origin: (origin, callback) => {
    // Sin cabecera Origin (Postman, webhooks, server-to-server): CORS no aplica.
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(normalizeOrigin(origin))) return callback(null, true);
    return callback(null, false);
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  optionsSuccessStatus: 204,
  maxAge: 600,
};
app.use(cors(corsOptions));

// --- CRUCIAL: SERVIR ARCHIVOS ESTÁTICOS ---
// 🔒 HARDENING: /uploads/kyc y /uploads/contratos requieren URL firmada o JWT de admin
// (ver middleware/privateUploads.js). /uploads/imagenes sigue siendo público.
app.use(
  "/uploads",
  privateUploadsGuard,
  (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Neutraliza contenido activo (p. ej. SVG con scripts); los PDF se excluyen para que el visor funcione.
    if (!/\.pdf$/i.test(req.path)) {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
      );
    }
    next();
  },
  express.static(path.join(__dirname, "uploads"), {
    dotfiles: "deny",
    index: false,
    redirect: false,
    // ⚡ Las imágenes públicas llevan nombre único (timestamp+random): se pueden cachear en el
    // navegador/CDN. Los archivos privados (KYC/contratos) ya traen "private, no-store" y no se tocan.
    setHeaders: (res, filePath) => {
      if (!res.getHeader("Cache-Control") && /[\\/]uploads[\\/]imagenes[\\/]/.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=604800");
      }
    },
  }),
);

// Importa la conexión a la base de datos
const { sequelize } = require("./config/database");

// ===============================================
// ⚡ HEALTH CHECKS (antes del rate limiter: no consumen cupo ni tocan la BD salvo /ready)
// ===============================================
const crypto = require("crypto");
const { monitorEventLoopDelay } = require("perf_hooks");
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();
const publicCache = require("./middleware/publicCache");

// Liveness: el proceso responde. Úsalo como healthcheck de Railway.
app.get("/health", (req, res) => {
  res.status(shuttingDown ? 503 : 200).json({
    status: shuttingDown ? "shutting_down" : "ok",
    uptime: Math.round(process.uptime()),
  });
});

// Readiness: además la BD responde (máx. 2 s).
app.get("/health/ready", async (req, res) => {
  if (shuttingDown) return res.status(503).json({ status: "shutting_down" });
  let timer;
  try {
    await Promise.race([
      sequelize.query("SELECT 1"),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("db timeout")), 2000);
      }),
    ]);
    return res.status(200).json({ status: "ready" });
  } catch (e) {
    return res.status(503).json({ status: "db_unavailable" });
  } finally {
    clearTimeout(timer);
  }
});

// Métricas de diagnóstico: DESACTIVADO salvo que definas HEALTH_METRICS_TOKEN (y se envíe en x-health-token).
app.get("/health/metrics", (req, res) => {
  const token = process.env.HEALTH_METRICS_TOKEN;
  const sent = String(req.headers["x-health-token"] || "");
  const ok =
    token &&
    sent.length === token.length &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(token));
  if (!ok) return res.status(404).end();
  const pool = sequelize.connectionManager.pool;
  const mem = process.memoryUsage();
  const body = {
    pool: { size: pool.size, available: pool.available, using: pool.using, waiting: pool.waiting, max: pool.maxSize },
    eventLoopMs: {
      p50: +(loopDelay.percentile(50) / 1e6).toFixed(1),
      p99: +(loopDelay.percentile(99) / 1e6).toFixed(1),
      max: +(loopDelay.max / 1e6).toFixed(1),
    },
    memoryMB: { rss: +(mem.rss / 1048576).toFixed(0), heapUsed: +(mem.heapUsed / 1048576).toFixed(0) },
    publicCache: publicCache.stats(),
  };
  loopDelay.reset();
  res.json(body);
});

// Cierre ordenado: deja de aceptar conexiones nuevas, espera los requests en curso y cierra el pool.
async function gracefulShutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`🛑 ${signal} recibido: cerrando de forma ordenada...`);
  const force = setTimeout(() => {
    console.error("⏱️ Tiempo de cierre agotado: salida forzada.");
    process.exit(exitCode || 1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();
  try {
    if (httpServer) {
      const closed = new Promise((resolve) => httpServer.close(resolve));
      // Las conexiones keep-alive que terminan su request DESPUÉS del SIGTERM quedan ociosas y
      // mantendrían el servidor abierto: se barren periódicamente hasta que cierre.
      const sweep = setInterval(() => {
        if (typeof httpServer.closeIdleConnections === "function") httpServer.closeIdleConnections();
      }, 200);
      await closed;
      clearInterval(sweep);
    }
    await sequelize.close();
    console.log("✅ Cierre ordenado completado.");
    process.exit(exitCode);
  } catch (e) {
    console.error("❌ Error durante el cierre:", e);
    process.exit(exitCode || 1);
  }
}

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

// ================================================================
// 🧪 RUTA DE PRUEBA DE EMAIL (con OAuth2)
// ================================================================
// 🔒 HARDENING: antes era público (cualquiera podía disparar correos). Ahora solo admin.
app.get(
  "/test-email",
  authMiddlewareGlobal.authenticate,
  authMiddlewareGlobal.authorizeAdmin,
  async (req, res) => {
  try {
    await emailService.sendEmail(
      "administracion@loteplan.com", // Cambia por tu correo si quieres probar
      "🧪 Prueba manual OAuth2",
      "Correo de prueba desde endpoint /test-email",
      "<h1>✅ Funciona</h1><p>El envío con OAuth2 está operativo.</p>",
    );
    res.send("✅ Correo de prueba enviado correctamente (OAuth2)");
  } catch (error) {
    console.error("❌ Error en /test-email:", error.message);
    res.status(500).send("❌ Error al enviar el correo de prueba.");
  }
  },
);

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
const Adhesion = require("./models/adhesion");
const PagoAdhesion = require("./models/PagoAdhesion");
const AuditLog = require("./models/audit_log");

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
const favoritoRoutes = require("./routes/favorito.routes");
const kycRoutes = require("./routes/kyc.routes");
const adhesionRoutes = require("./routes/adhesion.routes");
const auditRoutes = require("./routes/audit.routes");

// Importación de las tareas programadas (CRON JOBS)
const {
  conciliatePendingPayments,
} = require("./tasks/conciliatePendingPayments");
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
const marcarCuotasAdhesionVencidas = require("./tasks/vencerCuotasAdhesion");
const { startStandbyDeactivator } = require("./tasks/deactivateStandbyTask");
const {
  startCleanupAbandonedInvestments,
} = require("./tasks/cleanupAbandonedInvestments");

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
app.use(globalRateLimiter);
console.log("✅ Rate limiter global activado");

// ⚡ Micro-caché de GET públicos (proyectos/lotes). Se invalida con cualquier escritura exitosa.
app.use("/api", publicCache);

// --------------------------------------------------------------------
// 5.3. 🔥 RUTAS DE LA API
// --------------------------------------------------------------------
app.use("/api/kyc", (req, res, next) => next());
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
app.use("/api/favoritos", favoritoRoutes);
app.use("/api/adhesion", adhesionRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/payment", pagoMercadoRoutes);
app.use(redireccionRoutes);

app.use((err, req, res, next) => {
  console.error("❌ Error no capturado:", err.message);
  console.error(err.stack);

  // Si la respuesta ya fue enviada, delegamos al handler por defecto
  if (res.headersSent) return next(err);

  const status = err.status || err.statusCode || 500;
  // 🔒 HARDENING: en producción no se exponen mensajes internos en errores 5xx.
  const exponerMensaje =
    status < 500 ||
    process.env.NODE_ENV !== "production" ||
    err.expose === true ||
    err.name === "MulterError"; // errores de validación de subidas: seguros de mostrar
  res.status(status).json({
    success: false,
    error: exponerMensaje
      ? err.message || "Error interno del servidor"
      : "Error interno del servidor",
  });
});
// ====================================================================
// 6. SINCRONIZACIÓN DE BASE DE DATOS E INICIO DEL SERVIDOR (CRÍTICO)
// ====================================================================

async function synchronizeDatabase() {
  try {
    // ==========================================================
    // FASE 1: Creación inicial de las tablas (solo columnas)
    // ⚠️ IMPORTANTE (pérdida de datos): en esta fase las asociaciones AÚN no están definidas, por lo que
    // columnas que existen solo vía asociación (inversion.id_suscripcion, puja.id_proyecto,
    // proyecto.id_creador_proyecto) NO son atributos del modelo. Con `alter: true`, Sequelize las
    // consideraba "sobrantes" y ejecutaba DROP COLUMN en CADA arranque (la Fase 2 las recreaba vacías):
    // se perdían sus datos con cada reinicio/deploy. Aquí solo se crean las tablas que falten
    // (sync() sin alter); el `alter` se aplica en la Fase 2, con las asociaciones ya cargadas.
    // ==========================================================
    await Usuario.sync();
    await Proyecto.sync();
    //await Lote.sync({ alter: true });
    await SuscripcionProyecto.sync();
    await SuscripcionCancelada.sync();
    await CuotaMensual.sync();
    await ResumenCuenta.sync();
    await Mensaje.sync();
    await Puja.sync();
    await Inversion.sync();
    await Pago.sync();
    await PagoMercado.sync();
    await Transaccion.sync();
    await Imagen.sync();
    await Contrato.sync();
    await ContratoPlantilla.sync();
    await ContratoFirmado.sync();
    await Favorito.sync();
    await VerificacionIdentidad.sync();
    await AuditLog.sync();

    // ==========================================================
    // ASOCIACIONES
    // ==========================================================
    configureAssociations();

    // ==========================================================
    // FASE 2: Sincronización para añadir las Claves Foráneas (FKs)
    // ==========================================================
    await Usuario.sync(SYNC_OPTIONS);
    await Proyecto.sync(SYNC_OPTIONS);
    //await Lote.sync({ alter: true });
    await SuscripcionProyecto.sync(SYNC_OPTIONS);
    await SuscripcionCancelada.sync(SYNC_OPTIONS);
    await CuotaMensual.sync(SYNC_OPTIONS);
    await ResumenCuenta.sync(SYNC_OPTIONS);
    await Mensaje.sync(SYNC_OPTIONS);
    await Puja.sync(SYNC_OPTIONS);
    await Inversion.sync(SYNC_OPTIONS);
    await Pago.sync(SYNC_OPTIONS);
    await PagoMercado.sync(SYNC_OPTIONS);
    await Adhesion.sync(SYNC_OPTIONS);
    await PagoAdhesion.sync(SYNC_OPTIONS);
    await Transaccion.sync(SYNC_OPTIONS);
    await Imagen.sync(SYNC_OPTIONS);
    await Contrato.sync(SYNC_OPTIONS);
    await ContratoPlantilla.sync(SYNC_OPTIONS);
    await ContratoFirmado.sync(SYNC_OPTIONS);
    await Favorito.sync(SYNC_OPTIONS);
    await VerificacionIdentidad.sync(SYNC_OPTIONS);
    await AuditLog.sync(SYNC_OPTIONS);

    console.log("¡Base de datos y relaciones sincronizadas correctamente!");

    // ⚡ sync({ alter: true }) ejecuta ALTER COLUMN ... TYPE sobre cada columna en CADA arranque y
    // Postgres descarta las estadísticas del planificador de las columnas alteradas (medido: 120 -> 12
    // columnas con estadísticas tras un reinicio). Sin estadísticas el planificador elige planes
    // pésimos (seq scans + hash joins de tablas enteras) hasta que el autovacuum vuelva a analizar,
    // lo que en tablas poco modificadas puede tardar días. Se recalculan en segundo plano.
    // ANALYZE no bloquea lecturas ni escrituras. Desactivar: DB_ANALYZE_AFTER_SYNC=false.
    if (SYNC_OPTIONS.alter && process.env.DB_ANALYZE_AFTER_SYNC !== "false") {
      sequelize
        .transaction(async (t) => {
          await sequelize.query("SET LOCAL statement_timeout = 0", { transaction: t });
          await sequelize.query("ANALYZE", { transaction: t });
        })
        .then(() => console.log("📊 Estadísticas del planificador recalculadas (ANALYZE)."))
        .catch((e) => console.error("⚠️ No se pudo ejecutar ANALYZE post-sync:", e.message));
    }

    // ✅ NUEVO: Inicializar rate limiters DESPUÉS de que la DB esté lista.
    await initRateLimiters();

    // ==========================================================
    // INICIO DE TAREAS PROGRAMADAS (CRON JOBS)
    // ==========================================================
    if (!ENABLE_CRON) {
      console.log("⏸️ Cron jobs DESHABILITADOS (ENABLE_CRON=false).");
    } else {
    paymentReminderScheduler.scheduleJobs();
    startStandbyDeactivator();
    monthlyPaymentGenerationTask.start();
    overduePaymentManager.start();
    overduePaymentNotifier.start();
    cleanupUnconfirmedUsersTask.start();
    initAuctionScheduler();
    startCronJobs();
    iniciarCronJobExpiracion();
    subscriptionCheckScheduler.scheduleJobs();
    startCleanupAbandonedInvestments();
    const cron = require("node-cron");
    cron.schedule("0 0 * * *", async () => {
      console.log("🕒 Ejecutando tarea: marcarCuotasAdhesionVencidas");
      await marcarCuotasAdhesionVencidas();
    });
    cron.schedule("*/30 * * * *", async () => {
      await conciliatePendingPayments();
    });
    console.log(
      "🔄 Cron de conciliación de pagos pendientes programado cada 30 minutos.",
    );
    const cleanOldAuditLogs = require("./tasks/cleanAuditLogs");
    cron.schedule("0 2 * * 0", async () => {
      console.log("🕒 Limpiando logs de auditoría antiguos...");
      await cleanOldAuditLogs();
    });
    } // fin if (ENABLE_CRON)

    if (!ENABLE_HTTP) {
      console.log("⏸️ Servidor HTTP DESHABILITADO (ENABLE_HTTP=false): este proceso solo corre tareas programadas.");
      return;
    }

    // Inicia el servidor de Express
    httpServer = app.listen(PORT, "0.0.0.0", async () => {
      // <-- async añadido
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

      // ======================================================
      // 🧪 PRUEBA DE CORREO CON OAUTH2 AL ARRANCAR EL SERVIDOR
      // 🔒 HARDENING: en producción solo si SEND_STARTUP_TEST_EMAIL=true
      // (evita un correo en cada reinicio/deploy y un destinatario fijo en el código).
      // ======================================================
      if (
        process.env.NODE_ENV === "production" &&
        process.env.SEND_STARTUP_TEST_EMAIL !== "true"
      ) {
        return;
      }
      try {
        await emailService.sendEmail(
          "astudillo5677@gmail.com", // Cambia por tu email si quieres verlo
          "🧪 Prueba OAuth2 - Loteplan (inicio de servidor)",
          "Correo de prueba automático al iniciar el servidor.",
          "<h1>✅ Configuración OAuth2 correcta</h1><p>El envío automático funciona.</p><p>Este correo se envía cada vez que se reinicia el servidor.</p>",
        );
        console.log(
          "✅ Correo de prueba enviado con OAuth2 a astudillo5677@gmail",
        );
      } catch (error) {
        console.error(
          "❌ Error al enviar correo de prueba con OAuth2:",
          error.message,
        );
        // No detenemos el servidor, solo mostramos el error.
      }
    });

    // ⚡ El proxy de Railway mantiene conexiones keep-alive ociosas ~60 s. Con el default de Node (5 s)
    // el servidor cerraba la conexión justo cuando el proxy la reutilizaba -> errores 502 esporádicos.
    httpServer.keepAliveTimeout = 65000;
    httpServer.headersTimeout = 66000;
  } catch (error) {
    console.error("Error al sincronizar la base de datos:", error);
    process.exit(1);
  }
}

synchronizeDatabase();
