// controllers/adhesion.controller.js
const adhesionService = require("../services/adhesion.service");
const transaccionService = require("../services/transaccion.service");

/**
 * POST /api/adhesion
 * Crea una nueva adhesión (plan de pago del 4% del valor móvil)
 * Body: { proyectoId, planPago }  (planPago: "contado" | "6_cuotas" | "12_cuotas")
 */
exports.crearAdhesion = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const { proyectoId, planPago } = req.body;

    if (!proyectoId || !planPago) {
      return res
        .status(400)
        .json({ error: "Faltan campos: proyectoId, planPago" });
    }

    const adhesion = await adhesionService.crearAdhesion(
      usuarioId,
      proyectoId,
      planPago,
    );
    res.status(201).json({ success: true, data: adhesion });
  } catch (error) {
    console.error("Error crearAdhesion:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/adhesion/:id
 * Obtiene los detalles de una adhesión (con sus cuotas)
 */
exports.obtenerAdhesion = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const { id } = req.params;
    const adhesion = await adhesionService.obtenerAdhesion(id, usuarioId);
    if (!adhesion) {
      return res
        .status(404)
        .json({ success: false, message: "Adhesión no encontrada" });
    }
    res.json({ success: true, data: adhesion });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/adhesion/usuario
 * Lista todas las adhesiones del usuario autenticado
 */
exports.listarAdhesionesUsuario = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const Adhesion = require("../models/adhesion");
    const adhesiones = await Adhesion.findAll({
      where: { id_usuario: usuarioId },
      include: [
        {
          model: require("../models/proyecto"),
          as: "proyecto",
          attributes: ["id", "nombre_proyecto"],
        },
        {
          model: require("../models/pagoAdhesion"),
          as: "pagos",
          order: [["numero_cuota", "ASC"]],
        },
      ],
      order: [["createdAt", "DESC"]],
    });
    res.json({ success: true, data: adhesiones });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/adhesion/pagar-cuota
 * Inicia el checkout para pagar una cuota específica de una adhesión
 * Body: { adhesionId, numeroCuota }
 */
exports.pagarCuotaAdhesion = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const { adhesionId, numeroCuota } = req.body;

    // Verificar que la cuota exista y esté pendiente
    const adhesion = await adhesionService.obtenerAdhesion(
      adhesionId,
      usuarioId,
    );
    if (!adhesion) throw new Error("Adhesión no encontrada");

    const cuota = adhesion.pagos.find(
      (p) => p.numero_cuota === numeroCuota && p.estado === "pendiente",
    );
    if (!cuota) throw new Error("Cuota no disponible para pago");

    // Iniciar transacción + checkout
    const { redirectUrl } =
      await transaccionService.iniciarTransaccionYCheckout(
        "pagoAdhesion",
        cuota.id,
        usuarioId,
      );
    res.json({ success: true, redirectUrl });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/adhesion/:id
 * Cancela una adhesión (usuario dueño o admin)
 * Body opcional: { motivo }
 */
exports.cancelarAdhesion = async (req, res) => {
  try {
    const userId = req.user.id;
    const esAdmin = req.user.rol === "admin";
    const { id } = req.params;
    const { motivo } = req.body;

    const resultado = await adhesionService.cancelarAdhesion(
      id,
      userId,
      esAdmin,
      motivo,
    );
    res.json({ success: true, message: resultado.message });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/adhesion/admin/forzar-pago
 * Solo admin: fuerza el pago de una cuota de adhesión
 * Body: { adhesionId, numeroCuota, motivo }
 */
exports.forzarPagoCuota = async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Acceso denegado." });
    }
    const { adhesionId, numeroCuota, motivo } = req.body;
    const adminId = req.user.id;

    if (!adhesionId || !numeroCuota) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Faltan adhesionId y/o numeroCuota.",
        });
    }

    const resultado = await adhesionService.forzarPagoCuota(
      adhesionId,
      numeroCuota,
      motivo,
      adminId,
    );
    res.json({ success: true, ...resultado });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/adhesion/admin/all
 * Solo admin: lista todas las adhesiones del sistema (auditoría)
 */
exports.listarTodasAdhesiones = async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Acceso denegado." });
    }
    const adhesiones = await adhesionService.listarTodasAdhesiones();
    res.json({ success: true, total: adhesiones.length, data: adhesiones });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/adhesion/suscripcion/:suscripcionId
 * Obtiene la adhesión asociada a una suscripción (usuario autenticado o admin)
 */
exports.obtenerAdhesionPorSuscripcion = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const esAdmin = req.user.rol === "admin";
    const { suscripcionId } = req.params;
    const adhesion = await adhesionService.obtenerAdhesionPorSuscripcion(
      suscripcionId,
      esAdmin ? null : usuarioId,
    );
    if (!adhesion) {
      return res.status(404).json({ success: false, message: "No hay adhesión asociada a esta suscripción" });
    }
    res.json({ success: true, data: adhesion });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/adhesion/admin/metrics
 * Solo admin: métricas globales de adhesiones
 */
exports.getAdhesionMetrics = async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ success: false, message: "Acceso denegado." });
    }
    const metrics = await adhesionService.getAdhesionMetrics();
    res.json({ success: true, data: metrics });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/adhesion/admin/overdue
 * Solo admin: lista de cuotas de adhesión vencidas
 */
exports.getOverdueAdhesionPayments = async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ success: false, message: "Acceso denegado." });
    }
    const overdue = await adhesionService.getOverdueAdhesionPayments();
    res.json({ success: true, data: overdue });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/adhesion/admin/payment-history/:adhesionId
 * Solo admin: historial completo de pagos de una adhesión
 */
exports.getPaymentHistory = async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ success: false, message: "Acceso denegado." });
    }
    const { adhesionId } = req.params;
    const history = await adhesionService.getPaymentHistory(adhesionId);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};