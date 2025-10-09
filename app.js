const express = require("express");
const app = express();
const PORT = 3000;
const multer = require("multer");
const path = require("path");
const fs = require("fs");
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
    "     ERROR CRÍTICO: Las variables MP_ACCESS_TOKEN y HOST_URL deben estar configuradas."
  );
  console.error("     El servicio de pagos NO funcionará.");
  console.error(
    "========================================================================="
  );
}

// 🚨 FUNCIÓN CRÍTICA PARA CAPTURAR EL CUERPO RAW (SIN PARSEAR)
// Esto es lo que permite que la función verifySignature en el controlador funcione.
// El cuerpo crudo se guarda en req.rawBody
function captureRawBody(req, res, buf, encoding) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || "utf8");
  }
}

// ====================================================================
// 🎯 CORRECCIÓN CRÍTICA PARA EL WEBHOOK: Middleware Específico
//
// 1. Aplicamos body-parser CON la función 'verify' SOLO a la ruta del webhook.
// 2. Usamos express.json para que req.body esté disponible para el controller.
//    (Aunque la validación de firma que te pasé no necesita req.rawBody,
//    es buena práctica tenerlo si el hash se calcula sobre el cuerpo *raw*).
// ====================================================================
app.use(
  "/api/payment/webhook/:metodo",
  express.json({ verify: captureRawBody }),
  express.urlencoded({ extended: true, verify: captureRawBody })
);

// ====================================================================
// 3. MIDDLEWARES GLOBALES (Para el resto de las rutas de la API)
//
// Se aplican a *todas* las peticiones que no pasaron por el middleware anterior.
// Usamos los middlewares estándar sin la función 'verify' especial aquí.
// ====================================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- CRUCIAL: SERVIR ARCHIVOS ESTÁTICOS ---
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Importa la conexión a la base de datos
const { sequelize } = require("./config/database");

// ... (Resto de la configuración de multer y directorios, sin cambios)
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

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
const Contrato = require("./models/contrato");
const SuscripcionProyecto = require("./models/suscripcion_proyecto");

// Importa la función de asociaciones
const configureAssociations = require("./models/associations");

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
const redireccionRoutes = require("./routes/redireccion.routes");

const paymentReminderScheduler = require("./tasks/paymentReminderScheduler");

// Importación de las tareas programadas
const monthlyPaymentGenerationTask = require("./tasks/monthlyPaymentGenerationTask");
const overduePaymentManager = require("./tasks/OverduePaymentManager");
const overduePaymentNotifier = require("./tasks/OverduePaymentNotifier");

// ====================================================================
// 4. RUTAS DEL WEBHOOK (Aplicada después del middleware especial)
// ====================================================================
app.post("/api/payment/webhook/:metodo", paymentController.handleWebhook);

console.log(
  "✅ Ruta de webhook configurada: POST /api/payment/webhook/:metodo"
);

// 5. OTRAS RUTAS DE LA API (CON AUTENTICACIÓN)
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

// 6. RUTAS DE PAGO (AUTENTICADAS) - SIN EL WEBHOOK
app.use("/api/payment", pagoMercadoRoutes);

// 7. RUTAS DE REDIRECCIÓN (PÁGINAS DE RESULTADO DE PAGO)
app.use(redireccionRoutes);

async function synchronizeDatabase() {
  try {
    // ==========================================================
    // FASE 1: Creación inicial de las tablas (solo columnas)
    // ==========================================================
    await Usuario.sync({ alter: true });
    await Proyecto.sync({ alter: true });
    await Lote.sync({ alter: true });
    await SuscripcionProyecto.sync({ alter: true });
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

    // ==========================================================
    // 🎯 FIX CRÍTICO: Definimos las asociaciones AQUÍ, después de que
    // todas las tablas existen en la base de datos.
    // ==========================================================
    configureAssociations();

    // ==========================================================
    // FASE 2: Sincronización para añadir las Claves Foráneas (FKs)
    // ==========================================================
    await Usuario.sync({ alter: true });
    await Proyecto.sync({ alter: true });
    await Lote.sync({ alter: true });
    await SuscripcionProyecto.sync({ alter: true });
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
