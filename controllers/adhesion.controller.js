// controllers/adhesion.controller.js
const adhesionService = require("../services/adhesion.service");
const transaccionService = require("../services/transaccion.service");
const auth2faService = require("../services/auth2fa.service");
const usuarioService = require("../services/usuario.service");
const PagoAdhesion = require("../models/pagoAdhesion");

/**
 * POST /api/adhesion
 * Crea una nueva adhesión (plan de pago del 4% del valor móvil)
 * Body: { proyectoId, planPago }  (planPago: "contado" | "3_cuotas" | "6_cuotas")
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
    const esAdmin = req.user.rol === "admin";
    const { id } = req.params;
    // Si es admin, pasar null para que el servicio no filtre por usuario
    const adhesion = await adhesionService.obtenerAdhesion(
      id,
      esAdmin ? null : usuarioId,
    );
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
exports.obtenerCuotasImpagas = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const esAdmin = req.user.rol === "admin";
    const { id } = req.params;

    // Validar que el usuario tenga acceso a esta adhesión
    const adhesion = await adhesionService.obtenerAdhesion(
      id,
      esAdmin ? null : usuarioId,
    );
    if (!adhesion) {
      return res
        .status(404)
        .json({ success: false, message: "Adhesión no encontrada" });
    }

    const cuotas = await adhesionService.obtenerCuotasPendientes(id);
    res.json({ success: true, data: cuotas });
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

// ============================================================
// NUEVOS ENDPOINTS PARA PAGO DE CUOTA CON 2FA (stateless)
// ============================================================

/**
 * Paso 1: Inicia el proceso de pago de una cuota de adhesión.
 * Si el usuario tiene 2FA activo, devuelve los datos de la cuota para solicitar código.
 * Si no tiene 2FA, crea directamente la transacción y el checkout.
 */
exports.iniciarPagoCuota = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const { adhesionId, numeroCuota } = req.body;

    if (!adhesionId || !numeroCuota) {
      return res
        .status(400)
        .json({ error: "Faltan adhesionId o numeroCuota." });
    }

    // ✅ Validar orden de pago ANTES de cualquier otra cosa
    await adhesionService.validarCuotaPagable(
      adhesionId,
      numeroCuota,
      usuarioId,
    );

    const adhesion = await adhesionService.obtenerAdhesion(
      adhesionId,
      usuarioId,
    );
    if (!adhesion) throw new Error("Adhesión no encontrada");

    const cuota = adhesion.pagos.find(
      (p) => p.numero_cuota === numeroCuota && p.estado === "pendiente",
    );
    if (!cuota) throw new Error("Cuota no disponible para pago");

    const user = await usuarioService.findById(usuarioId);
    if (!user) throw new Error("Usuario no encontrado");

    if (user.is_2fa_enabled) {
      return res.status(202).json({
        message: "Se requiere verificación 2FA.",
        requires2FA: true,
        pagoAdhesionId: cuota.id,
        adhesionId,
        numeroCuota,
      });
    }

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
 * Paso 2: Verifica el código 2FA y, si es correcto, crea la transacción y el checkout.
 */
exports.confirmarPagoCuota = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const { pagoAdhesionId, codigo_2fa } = req.body;

    if (!pagoAdhesionId || !codigo_2fa) {
      return res
        .status(400)
        .json({ error: "Faltan pagoAdhesionId o codigo_2fa." });
    }

    const pagoAdhesion = await PagoAdhesion.findByPk(pagoAdhesionId, {
      include: [{ model: require("../models/adhesion"), as: "adhesion" }],
    });
    if (!pagoAdhesion) throw new Error("Cuota no encontrada");
    if (pagoAdhesion.estado !== "pendiente")
      throw new Error("Cuota ya no está disponible para pago");

    const adhesion = pagoAdhesion.adhesion;
    if (adhesion.id_usuario !== usuarioId) {
      return res.status(403).json({ error: "Esta cuota no te pertenece." });
    }

    // ✅ Validar orden de pago ANTES de generar el checkout
    await adhesionService.validarCuotaPagable(
      adhesion.id,
      pagoAdhesion.numero_cuota,
      usuarioId,
    );

    const user = await usuarioService.findById(usuarioId);
    if (!user || !user.is_2fa_enabled || !user.twofa_secret) {
      return res
        .status(403)
        .json({ error: "2FA no activo o configuración inválida." });
    }

    const isVerified = auth2faService.verifyToken(
      user.twofa_secret,
      codigo_2fa,
    );
    if (!isVerified) {
      return res.status(401).json({ error: "Código 2FA incorrecto." });
    }

    const { redirectUrl } =
      await transaccionService.iniciarTransaccionYCheckout(
        "pagoAdhesion",
        pagoAdhesion.id,
        usuarioId,
      );
    res.json({ success: true, redirectUrl });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ============================================================
// FIN DE NUEVOS ENDPOINTS
// ============================================================

/**
 * POST /api/adhesion/pagar-cuota
 * [DEPRECADO] Se mantiene por compatibilidad (sin 2FA). Se recomienda usar los nuevos endpoints.
 */
exports.pagarCuotaAdhesion = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const { adhesionId, numeroCuota } = req.body;

    const adhesion = await adhesionService.obtenerAdhesion(
      adhesionId,
      usuarioId,
    );
    if (!adhesion) throw new Error("Adhesión no encontrada");

    const cuota = adhesion.pagos.find(
      (p) => p.numero_cuota === numeroCuota && p.estado === "pendiente",
    );
    if (!cuota) throw new Error("Cuota no disponible para pago");

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

// ============================================================
// CANCELACIÓN DE ADHESIÓN CON 2FA (stateless, sin Map)
// ============================================================

/**
 * Paso 1: Inicia la cancelación de una adhesión.
 * Si el usuario tiene 2FA activo, devuelve el adhesionId para solicitar código.
 * Si no, cancela directamente.
 */
exports.iniciarCancelacionAdhesion = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const { id } = req.params;
    const esAdmin = req.user.rol === "admin";
    const { motivo } = req.body;
    const ip = req.ip || req.headers["x-forwarded-for"] || null;
    const userAgent = req.get("user-agent") || null;

    // Validar existencia de la adhesión
    const adhesion = await adhesionService.obtenerAdhesion(
      id,
      esAdmin ? null : usuarioId,
    );
    if (!adhesion) {
      return res.status(404).json({
        success: false,
        message: "Adhesión no encontrada",
      });
    }

    if (adhesion.estado === "completada") {
      return res.status(400).json({
        success: false,
        message:
          "No se puede cancelar una adhesión completada. Cancela la suscripción.",
      });
    }
    if (adhesion.estado === "cancelada") {
      return res.status(400).json({
        success: false,
        message: "La adhesión ya está cancelada.",
      });
    }

    // ✅ Si es admin, cancelar directamente (sin 2FA)
    if (esAdmin) {
      const resultado = await adhesionService.cancelarAdhesion(
        id,
        usuarioId,
        esAdmin,
        motivo,
        null,
        ip,
        userAgent,
      );
      return res.json({ success: true, message: resultado.message });
    }

    // ✅ Usuario normal: debe tener 2FA activo obligatoriamente
    const user = await usuarioService.findById(usuarioId);
    if (!user) throw new Error("Usuario no encontrado");

    if (!user.is_2fa_enabled || !user.twofa_secret) {
      return res.status(403).json({
        success: false,
        message:
          "Debes activar la verificación en dos pasos (2FA) antes de poder cancelar la adhesión.",
      });
    }

    // Si tiene 2FA, devolver 202 para solicitar código
    return res.status(202).json({
      message: "Se requiere verificación 2FA para cancelar la adhesión.",
      requires2FA: true,
      adhesionId: id,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Paso 2: Confirma la cancelación con el código 2FA.
 */
exports.confirmarCancelacionAdhesion = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const { adhesionId, codigo_2fa, motivo } = req.body;
    const ip = req.ip || req.headers["x-forwarded-for"] || null;
    const userAgent = req.get("user-agent") || null;

    if (!adhesionId || !codigo_2fa) {
      return res.status(400).json({ error: "Faltan adhesionId o codigo_2fa." });
    }

    const user = await usuarioService.findById(usuarioId);
    if (!user || !user.is_2fa_enabled || !user.twofa_secret) {
      return res
        .status(403)
        .json({ error: "2FA no activo o configuración inválida." });
    }

    const isVerified = auth2faService.verifyToken(
      user.twofa_secret,
      codigo_2fa,
    );
    if (!isVerified) {
      return res.status(401).json({ error: "Código 2FA incorrecto." });
    }

    const esAdmin = req.user.rol === "admin";
    const resultado = await adhesionService.cancelarAdhesion(
      adhesionId,
      usuarioId,
      esAdmin,
      motivo,
      null,
      ip,
      userAgent,
    );
    res.json({ success: true, message: resultado.message });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ============================================================
// FIN DE CANCELACIÓN DE ADHESIÓN
// ============================================================

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
    const ip = req.ip || req.headers["x-forwarded-for"] || null;
    const userAgent = req.get("user-agent") || null;

    if (!adhesionId || !numeroCuota) {
      return res.status(400).json({
        success: false,
        message: "Faltan adhesionId y/o numeroCuota.",
      });
    }

    const resultado = await adhesionService.forzarPagoCuota(
      adhesionId,
      numeroCuota,
      motivo,
      adminId,
      ip,
      userAgent,
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
      return res.status(404).json({
        success: false,
        message: "No hay adhesión asociada a esta suscripción",
      });
    }
    res.json({ success: true, data: adhesion });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/adhesion/admin/metrics
 * Solo admin: métricas globales de adhesiones con opción de filtro por fechas
 * Query params: fechaInicio (YYYY-MM-DD), fechaFin (YYYY-MM-DD)
 */
exports.getAdhesionMetrics = async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Acceso denegado." });
    }
    const { fechaInicio, fechaFin } = req.query;
    let startDate = null,
      endDate = null;
    if (fechaInicio) startDate = new Date(fechaInicio);
    if (fechaFin) endDate = new Date(fechaFin);
    const metrics = await adhesionService.getAdhesionMetrics(
      startDate,
      endDate,
    );
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
      return res
        .status(403)
        .json({ success: false, message: "Acceso denegado." });
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
      return res
        .status(403)
        .json({ success: false, message: "Acceso denegado." });
    }
    const { adhesionId } = req.params;
    const history = await adhesionService.getPaymentHistory(adhesionId);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
