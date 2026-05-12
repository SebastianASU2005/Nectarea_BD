// Archivo: controllers/pago.controller.js

const pagoService = require("../services/pago.service");
const transaccionService = require("../services/transaccion.service");
const auth2faService = require("../services/auth2fa.service");
const usuarioService = require("../services/usuario.service");
const { sequelize } = require("../config/database");

const pagoController = {
  // ===================================================================
  // FUNCIONES BÁSICAS
  // ===================================================================

  async create(req, res) {
    try {
      const nuevoPago = await pagoService.create(req.body);
      res.status(201).json(nuevoPago);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async findMyPayments(req, res) {
    try {
      const userId = req.user.id;
      const pagos = await pagoService.findByUserId(userId);
      if (!pagos || pagos.length === 0) {
        return res
          .status(200)
          .json({
            message: "No tienes pagos registrados hasta el momento.",
            data: [],
          });
      }
      return res.status(200).json({ total: pagos.length, data: pagos });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // CHECKOUT CON 2FA
  // ===================================================================

  async requestCheckout(req, res) {
    try {
      if (req.user.rol === "admin") {
        return res
          .status(403)
          .json({
            error:
              "⛔ Los administradores no pueden realizar pagos como clientes.",
          });
      }
      const pagoId = req.params.id;
      const userId = req.user.id;
      const [pagoValidado, user] = await Promise.all([
        pagoService.getValidPaymentDetails(pagoId, userId),
        usuarioService.findById(userId),
      ]);
      if (user.is_2fa_enabled) {
        return res.status(202).json({
          message: "Se requiere verificación 2FA para iniciar el checkout.",
          is2FARequired: true,
          pagoId: pagoValidado.id,
        });
      }
      const { transaccion, redirectUrl } =
        await transaccionService.iniciarTransaccionYCheckout(
          "pago",
          pagoValidado.id,
          userId,
        );
      res.status(200).json({
        message: `Transacción #${transaccion.id} creada. Redireccionando a la pasarela de pago.`,
        transaccionId: transaccion.id,
        pagoId: pagoValidado.id,
        monto: parseFloat(pagoValidado.monto),
        redirectUrl: redirectUrl,
      });
    } catch (error) {
      const message = error.message;
      if (
        message.includes("Acceso denegado") ||
        message.includes("no encontrado")
      )
        return res.status(403).json({ error: message });
      if (message.includes("ya se encuentra en estado"))
        return res.status(409).json({ error: message });
      res.status(400).json({ error: message });
    }
  },

  async confirmarPagoYContinuar(req, res) {
    try {
      const userId = req.user.id;
      const { pagoId, codigo_2fa } = req.body;
      const [user, pagoValidado] = await Promise.all([
        usuarioService.findById(userId),
        pagoService.getValidPaymentDetails(pagoId, userId),
      ]);
      if (!user.is_2fa_enabled || !user.twofa_secret) {
        return res
          .status(403)
          .json({ error: "2FA no activo o error de flujo." });
      }
      const isVerified = auth2faService.verifyToken(
        user.twofa_secret,
        codigo_2fa,
      );
      if (!isVerified)
        return res.status(401).json({ error: "Código 2FA incorrecto." });
      const { transaccion, redirectUrl } =
        await transaccionService.iniciarTransaccionYCheckout(
          "pago",
          pagoValidado.id,
          userId,
        );
      res.status(200).json({
        message: `Verificación 2FA exitosa. Transacción #${transaccion.id} creada.`,
        transaccionId: transaccion.id,
        redirectUrl: redirectUrl,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================
  // ADMINISTRACIÓN BÁSICA (CRUD)
  // ===================================================================

  async findAll(req, res) {
    try {
      const pagos = await pagoService.findAll();
      res.status(200).json(pagos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const isAdmin = req.user.role === "admin";
      const pago = await pagoService.findById(id);
      if (!pago) return res.status(404).json({ error: "Pago no encontrado." });
      if (!isAdmin && pago.id_usuario !== userId)
        return res
          .status(403)
          .json({ error: "No tienes permiso para ver este pago." });
      res.status(200).json(pago);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const pagoActualizado = await pagoService.update(req.params.id, req.body);
      if (!pagoActualizado)
        return res.status(404).json({ error: "Pago no encontrado." });
      res.status(200).json(pagoActualizado);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async softDelete(req, res) {
    try {
      const pagoEliminado = await pagoService.softDelete(req.params.id);
      if (!pagoEliminado)
        return res.status(404).json({ error: "Pago no encontrado." });
      res.status(200).json({ message: "Pago eliminado correctamente." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // GENERACIÓN MANUAL DE PAGOS
  // ===================================================================

  async triggerManualPayment(req, res, next) {
    const t = await sequelize.transaction();
    try {
      const { id_suscripcion } = req.body;
      if (!id_suscripcion) {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "El id_suscripcion es requerido." });
      }
      const nuevoPago = await pagoService.generarPagoMensualConDescuento(
        id_suscripcion,
        { transaction: t },
      );
      if (nuevoPago.message) {
        await t.commit();
        return res.status(200).json(nuevoPago);
      }
      await t.commit();
      res.status(201).json({
        message: "Pago mensual simulado y creado exitosamente.",
        pago: {
          id: nuevoPago.id,
          id_suscripcion: nuevoPago.id_suscripcion,
          id_usuario: nuevoPago.id_usuario,
          id_proyecto: nuevoPago.id_proyecto,
          monto: nuevoPago.monto,
          estado_pago: nuevoPago.estado_pago,
          mes: nuevoPago.mes,
          fecha_vencimiento: nuevoPago.fecha_vencimiento,
        },
      });
    } catch (error) {
      await t.rollback();
      console.error("Error al generar pago manual:", error.message);
      next(error);
    }
  },

  async generateAdvancePayments(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id_suscripcion, cantidad_meses, monto_por_mes } = req.body;
      const pagosGenerados = await pagoService.generarPagosAdelantados(
        id_suscripcion,
        cantidad_meses,
        monto_por_mes,
        { transaction: t },
      );
      await t.commit();
      return res.status(201).json({
        message: `Generados ${pagosGenerados.length} pagos adelantados para la suscripción ID ${id_suscripcion}.`,
        pagos: pagosGenerados.map((p) => ({
          id: p.id,
          monto: p.monto,
          mes: p.mes,
          estado_pago: p.estado_pago,
        })),
      });
    } catch (error) {
      await t.rollback();
      return res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================
  // ✅ FUNCIÓN CORREGIDA: ACTUALIZAR MONTO (con auditoría)
  // ===================================================================

  async updatePaymentAmount(req, res) {
    try {
      const pagoId = parseInt(req.params.id);
      const { monto, motivo_cambio } = req.body;

      // 🔥 Obtener datos del administrador autenticado
      const adminId = req.user.id;
      const ip = req.ip || req.headers["x-forwarded-for"] || null;
      const userAgent = req.get("user-agent") || null;

      const pagoActualizado = await pagoService.actualizarMontoPago(
        pagoId,
        monto,
        motivo_cambio,
        adminId, // ← antes faltaba
        ip, // ← antes faltaba
        userAgent, // ← antes faltaba
      );

      return res.status(200).json({
        message: `Monto del Pago ID ${pagoId} actualizado a $${pagoActualizado.monto}.`,
        pago: {
          id: pagoActualizado.id,
          monto: pagoActualizado.monto,
          estado_pago: pagoActualizado.estado_pago,
          motivo_cambio: motivo_cambio || "N/A",
        },
      });
    } catch (error) {
      console.error("Error en updatePaymentAmount:", error.message);
      return res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================
  // ACTUALIZAR ESTADO DE PAGO (ya estaba correcta)
  // ===================================================================

  async updatePaymentStatus(req, res) {
    try {
      const pagoId = parseInt(req.params.id);
      const { estado_pago, motivo } = req.body;
      const adminId = req.user.id;
      const ip = req.ip || req.headers["x-forwarded-for"] || null;
      const userAgent = req.get("user-agent") || null;
      if (!estado_pago)
        return res
          .status(400)
          .json({ error: "El campo 'estado_pago' es requerido." });
      const pagoActualizado = await pagoService.updatePaymentStatus(
        pagoId,
        estado_pago,
        motivo,
        adminId,
        ip,
        userAgent,
      );
      return res.status(200).json({
        message: `Estado del Pago ID ${pagoId} actualizado a '${pagoActualizado.estado_pago}'.`,
        pago: {
          id: pagoActualizado.id,
          estado_pago: pagoActualizado.estado_pago,
          motivo: motivo || "N/A",
        },
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================
  // MÉTRICAS Y REPORTES
  // ===================================================================

  async getMonthlyMetrics(req, res) {
    try {
      const { mes, anio } = req.query;
      if (!mes || !anio || isNaN(mes) || isNaN(anio) || mes < 1 || mes > 12) {
        return res
          .status(400)
          .json({
            error:
              "Parámetros 'mes' (1-12) y 'anio' (YYYY) son requeridos y deben ser válidos.",
          });
      }
      const metrics = await pagoService.getMonthlyPaymentMetrics(
        parseInt(mes),
        parseInt(anio),
      );
      res
        .status(200)
        .json({
          message: `Métricas de Pagos para el mes ${mes}/${anio}.`,
          data: metrics,
        });
    } catch (error) {
      res
        .status(500)
        .json({ error: "Error interno al procesar las métricas de pago." });
    }
  },

  async getOnTimeRate(req, res) {
    try {
      const { mes, anio } = req.query;
      if (!mes || !anio || isNaN(mes) || isNaN(anio) || mes < 1 || mes > 12) {
        return res
          .status(400)
          .json({
            error:
              "Parámetros 'mes' (1-12) y 'anio' (YYYY) son requeridos y deben ser válidos.",
          });
      }
      const metrics = await pagoService.getOnTimePaymentRate(
        parseInt(mes),
        parseInt(anio),
      );
      res
        .status(200)
        .json({
          message: `Tasa de Pagos a Tiempo para el mes ${mes}/${anio}.`,
          data: metrics,
        });
    } catch (error) {
      res
        .status(500)
        .json({
          error: "Error interno al procesar la tasa de pagos a tiempo.",
        });
    }
  },

  async getPaymentMetricsByDateRange(req, res) {
    try {
      const { fechaInicio, fechaFin } = req.query;
      if (!fechaInicio || !fechaFin) {
        return res
          .status(400)
          .json({
            error: "Se requieren 'fechaInicio' y 'fechaFin' (YYYY-MM-DD).",
          });
      }
      const startDate = new Date(fechaInicio);
      const endDate = new Date(fechaFin);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res
          .status(400)
          .json({ error: "Fechas inválidas. Use YYYY-MM-DD." });
      }
      endDate.setHours(23, 59, 59, 999);
      const metrics = await pagoService.getPaymentMetricsByDateRange(
        startDate,
        endDate,
      );
      res.status(200).json({ success: true, data: metrics });
    } catch (error) {
      res
        .status(500)
        .json({
          success: false,
          error: "Error interno al procesar las métricas.",
        });
    }
  },

  async getPendingPaymentsBySubscription(req, res) {
    try {
      const id_suscripcion = parseInt(req.params.id_suscripcion);
      if (isNaN(id_suscripcion))
        return res.status(400).json({ error: "ID de suscripción inválido." });
      const pagos =
        await pagoService.findPendingPaymentsBySubscription(id_suscripcion);
      return res
        .status(200)
        .json({
          message: `Pagos pendientes/vencidos para la suscripción ID ${id_suscripcion}.`,
          data: pagos,
        });
    } catch (error) {
      res
        .status(500)
        .json({ error: "Error al obtener pagos pendientes por suscripción." });
    }
  },

  async getHistorialSuscripcion(req, res) {
    try {
      const { suscripcionId } = req.params;
      const pagos = await pagoService.findAllBySubscription(suscripcionId);
      if (!pagos || pagos.length === 0)
        return res
          .status(404)
          .json({ message: "No se encontraron pagos para esta suscripción." });
      return res.status(200).json(pagos);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },

  async getMySubscriptionHistory(req, res) {
    try {
      const userId = req.user.id;
      const suscripcionId = parseInt(req.params.suscripcionId);
      if (isNaN(suscripcionId))
        return res.status(400).json({ error: "ID de suscripción inválido." });
      const pagos = await pagoService.findAllBySubscriptionAndUser(
        suscripcionId,
        userId,
      );
      return res
        .status(200)
        .json({
          message: `Historial de pagos para tu suscripción ID ${suscripcionId}.`,
          data: pagos,
        });
    } catch (error) {
      if (error.message.includes("no te pertenece"))
        return res.status(403).json({ error: error.message });
      return res.status(500).json({ error: error.message });
    }
  },
};

module.exports = pagoController;
