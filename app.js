const express = require("express");
const app = express();
const PORT = 3000;
const multer = require("multer");
const path = require("path");
const fs = require("fs");
// Importa el controlador de pagos directamente para la ruta del webhook
const paymentController = require("./controllers/pagoMercado.controller"); // Asegúrate de que la ruta sea correcta

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
    " 	 ERROR CRÍTICO: Las variables MP_ACCESS_TOKEN y HOST_URL deben estar configuradas."
  );
  console.error(" 	 El servicio de pagos NO funcionará.");
  console.error(
    "========================================================================="
  );
}

// 🚨 CAMBIO CRÍTICO: Definición del middleware de JSON.
// Usamos el `verify` para capturar el cuerpo crudo (rawBody) antes de que se convierta a JSON.
// Esto es esencial si Mercado Pago usa el cuerpo CRUDO para generar la firma.
function captureRawBody(req, res, buf, encoding) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || "utf8");
  }
}
// Middleware para parsear el cuerpo de las peticiones JSON y capturar el raw body
app.use(express.json({ verify: captureRawBody }));
// Middleware para parsear bodies de formularios URL-encoded (también necesario)
app.use(express.urlencoded({ extended: true, verify: captureRawBody }));

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

// ❌ ELIMINADA: La llamada a configureAssociations() se mueve para después de la creación de las tablas.
// configureAssociations();

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
const pagoMercadoRoutes = require("./routes/pagoMercado.routes"); // Contiene las rutas que usan el controller
const redireccionRoutes = require("./routes/redireccion.routes");

const paymentReminderScheduler = require("./tasks/paymentReminderScheduler");

// Importación de las tareas programadas
const monthlyPaymentGenerationTask = require("./tasks/monthlyPaymentGenerationTask");
const overduePaymentManager = require("./tasks/OverduePaymentManager");
const overduePaymentNotifier = require("./tasks/OverduePaymentNotifier");

// Usar el router para las rutas de la API, separando la lógica
app.post("/api/payment/webhook/:metodo", paymentController.handleWebhook);

console.log(
  "✅ Ruta de webhook configurada: POST /api/payment/webhook/:metodo"
);

// 2. OTRAS RUTAS DE LA API (CON AUTENTICACIÓN)
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

// 3. RUTAS DE PAGO (AUTENTICADAS) - SIN EL WEBHOOK
app.use("/api/payment", pagoMercadoRoutes);

// 4. RUTAS DE REDIRECCIÓN (PÁGINAS DE RESULTADO DE PAGO)
app.use(redireccionRoutes);

async function synchronizeDatabase() {
  try {
    // ==========================================================
    // FASE 1: Creación inicial de las tablas (solo columnas)
    // El orden no es estrictamente crítico aquí porque eliminamos
    // todas las referencias directas en los modelos.
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
    await PagoMercado.sync({ alter: true }); // Esta tabla se crea sin la restricción FK
    await Transaccion.sync({ alter: true }); // Esta tabla se crea
    await Imagen.sync({ alter: true });
    await Contrato.sync({ alter: true });

    // ==========================================================
    // 🎯 FIX CRÍTICO: Definimos las asociaciones AQUÍ, después de que
    // todas las tablas existen en la base de datos.
    // ==========================================================
    configureAssociations();

    // ==========================================================
    // FASE 2: Sincronización para añadir las Claves Foráneas (FKs)
    // Sequelize ahora usará { alter: true } para añadir las restricciones
    // de clave foránea definidas por configureAssociations().
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
