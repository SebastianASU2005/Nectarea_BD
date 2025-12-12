// Archivo: controllers/pago.controller.js

const pagoService = require("../services/pago.service");
const transaccionService = require("../services/transaccion.service");
// 🛑 NUEVAS IMPORTACIONES REQUERIDAS PARA LA LÓGICA 2FA 🛑
const auth2faService = require("../services/auth2fa.service");
const usuarioService = require("../services/usuario.service");
const { sequelize } = require("../config/database");

/**
 * Controlador de Express para gestionar los pagos pendientes, incluyendo
 * la creación, listado, y el flujo de checkout con punto de control 2FA.
 */
const pagoController = {
  // ===================================================================
  // FUNCIONES BÁSICAS
  // ===================================================================

  /**
   * @async
   * @function create
   * @description Crea un nuevo registro de pago (generalmente iniciado por el sistema).
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async create(req, res) {
    try {
      const nuevoPago = await pagoService.create(req.body);
      res.status(201).json(nuevoPago);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findMyPayments
   * @description Obtiene todos los pagos asociados al usuario autenticado.
   * @param {object} req - Objeto de solicitud de Express (contiene `req.user.id`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findMyPayments(req, res) {
    try {
      const userId = req.user.id;
      const pagos = await pagoService.findByUserId(userId);
      res.status(200).json(pagos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // 🚀 FUNCIÓN MODIFICADA: INICIAR CHECKOUT (Bifurcación 2FA) 🚦
  // ===================================================================

  /**
   * @async
   * @function requestCheckout
   * @description Inicia el proceso de checkout para un pago pendiente.
   * Detiene el flujo con un código 202 si el 2FA está activo, solicitando el código al cliente.
   * @param {object} req - Objeto de solicitud de Express (con `id` del pago en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async requestCheckout(req, res) {
    try {
      if (req.user.rol === "admin") {
        return res.status(403).json({
          error:
            "⛔ Los administradores no pueden realizar pagos como clientes por motivos de seguridad.",
        });
      }
      const pagoId = req.params.id;
      const userId = req.user.id; // 👈 VERIFICA ESTE VALOR
      console.log(
        `[DEBUG] Pago ID: ${pagoId}, Usuario Autenticado ID: ${userId}`
      );

      // 1. Validar el pago (existencia, estado y propiedad) y obtener el usuario
      const [pagoValidado, user] = await Promise.all([
        pagoService.getValidPaymentDetails(pagoId, userId),
        usuarioService.findById(userId),
      ]);

      // 🛑 2. PUNTO DE CONTROL DE SEGURIDAD 2FA 🛑
      if (user.is_2fa_enabled) {
        // Retorna 202 Accepted para que el cliente sepa que debe enviar el código 2FA
        return res.status(202).json({
          message: "Se requiere verificación 2FA para iniciar el checkout.",
          is2FARequired: true,
          pagoId: pagoValidado.id,
        });
      }

      // 3. GENERAR LA TRANSACCIÓN Y EL CHECKOUT (Si el 2FA no está activo)
      const { transaccion, redirectUrl } =
        await transaccionService.iniciarTransaccionYCheckout(
          "pago",
          pagoValidado.id,
          userId
        );

      // 4. DEVOLVER DIRECTAMENTE LA URL DE REDIRECCIÓN
      res.status(200).json({
        message: `Transacción #${transaccion.id} creada. Redireccionando a la pasarela de pago.`,
        transaccionId: transaccion.id,
        pagoId: pagoValidado.id,
        monto: parseFloat(pagoValidado.monto),
        redirectUrl: redirectUrl,
      });
    } catch (error) {
      const message = error.message;

      // Manejo específico de errores
      if (
        message.includes("Acceso denegado") ||
        message.includes("no encontrado")
      ) {
        return res.status(403).json({ error: message });
      }
      if (message.includes("ya se encuentra en estado")) {
        return res.status(409).json({ error: message });
      }

      res.status(400).json({ error: message });
    }
  },

  // ===================================================================
  // 🚀 NUEVA FUNCIÓN: VERIFICAR 2FA Y CONTINUAR CHECKOUT
  // ===================================================================

  /**
   * @async
   * @function confirmarPagoYContinuar
   * @description Verifica el código 2FA proporcionado por el usuario y, si es correcto,
   * genera la Transacción y el Checkout para el pago pendiente.
   * @param {object} req - Objeto de solicitud de Express (con `pagoId` y `codigo_2fa` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async confirmarPagoYContinuar(req, res) {
    try {
      const userId = req.user.id;
      const { pagoId, codigo_2fa } = req.body;

      // 1. Obtener y validar datos (usuario y pago)
      const [user, pagoValidado] = await Promise.all([
        usuarioService.findById(userId),
        pagoService.getValidPaymentDetails(pagoId, userId), // Reutiliza la validación
      ]);

      if (!user.is_2fa_enabled || !user.twofa_secret) {
        return res.status(403).json({
          error: "2FA no activo o error de flujo. Intente el checkout normal.",
        });
      }

      // 2. VERIFICACIÓN CRÍTICA DEL 2FA
      const isVerified = auth2faService.verifyToken(
        user.twofa_secret,
        codigo_2fa
      );

      if (!isVerified) {
        return res
          .status(401)
          .json({ error: "Código 2FA incorrecto. Transacción rechazada." });
      }

      // 3. EJECUTAR LA LÓGICA DE PASARELA (Solo si el 2FA es correcto)
      const { transaccion, redirectUrl } =
        await transaccionService.iniciarTransaccionYCheckout(
          "pago",
          pagoValidado.id,
          userId
        );

      // 4. Respuesta de Éxito: Devolver la URL de redirección
      res.status(200).json({
        message: `Verificación 2FA exitosa. Transacción #${transaccion.id} creada. Redireccionando a la pasarela.`,
        transaccionId: transaccion.id,
        redirectUrl: redirectUrl,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================
  // FUNCIONES DE ADMINISTRACIÓN Y OTROS
  // ===================================================================

  /**
   * @async
   * @function findAll
   * @description Obtiene todos los pagos (para administradores).
   */
  async findAll(req, res) {
    try {
      const pagos = await pagoService.findAll();
      res.status(200).json(pagos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findById
   * @description Obtiene un pago por ID (para administradores).
   */
  async findById(req, res) {
    try {
      const pago = await pagoService.findById(req.params.id);
      if (!pago) {
        return res.status(404).json({ error: "Pago no encontrado." });
      }
      res.status(200).json(pago);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function update
   * @description Actualiza un pago por ID (para administradores).
   */
  async update(req, res) {
    try {
      const pagoActualizado = await pagoService.update(req.params.id, req.body);
      if (!pagoActualizado) {
        return res.status(404).json({ error: "Pago no encontrado." });
      }
      res.status(200).json(pagoActualizado);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function softDelete
   * @description Elimina lógicamente un pago por ID.
   */
  async softDelete(req, res) {
    try {
      const pagoEliminado = await pagoService.softDelete(req.params.id);
      if (!pagoEliminado) {
        return res.status(404).json({ error: "Pago no encontrado." });
      }
      res.status(200).json({ message: "Pago eliminado correctamente." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function triggerManualPayment
   * @description Función de administración o sistema para generar un pago mensual manualmente.
   * ✅ CORREGIDO: Ahora usa una transacción de BD para atomicidad.
   */
  async triggerManualPayment(req, res, next) {
    // ✅ AGREGAR IMPORTACIÓN AL INICIO DEL ARCHIVO
    const { sequelize } = require("../config/database");

    const t = await sequelize.transaction();

    try {
      const { id_suscripcion } = req.body;

      if (!id_suscripcion) {
        await t.rollback();
        return res.status(400).json({
          message: "El id_suscripcion es requerido.",
        });
      }

      // ✅ Pasar la transacción al servicio
      const nuevoPago = await pagoService.generarPagoMensualConDescuento(
        id_suscripcion,
        { transaction: t } // ✅ CRÍTICO: Pasar la transacción
      );

      if (nuevoPago.message) {
        // Maneja el caso en que el servicio devuelve un mensaje (sin meses restantes)
        await t.commit();
        return res.status(200).json(nuevoPago);
      }

      await t.commit(); // ✅ Confirmar cambios

      res.status(201).json({
        message: "Pago mensual simulado y creado exitosamente.",
        pago: {
          id: nuevoPago.id,
          id_suscripcion: nuevoPago.id_suscripcion,
          id_usuario: nuevoPago.id_usuario, // ✅ Ahora debería tener valor
          id_proyecto: nuevoPago.id_proyecto, // ✅ Ahora debería tener valor
          monto: nuevoPago.monto,
          estado_pago: nuevoPago.estado_pago,
          mes: nuevoPago.mes,
          fecha_vencimiento: nuevoPago.fecha_vencimiento,
        },
      });
    } catch (error) {
      await t.rollback(); // ✅ Revertir en caso de error
      console.error("Error al generar pago manual:", error.message);
      next(error);
    }
  },
  // ===================================================================
  // 📊 NUEVAS FUNCIONES DE REPORTE/MÉTRICAS
  // ===================================================================

  /**
   * @async
   * @function getMonthlyMetrics
   * @description Obtiene el Recaudo Mensual, Pagos Vencidos y Tasa de Morosidad para un mes/año.
   * @param {object} req - Query params: `mes` (1-12) y `anio` (YYYY).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async getMonthlyMetrics(req, res) {
    try {
      const { mes, anio } = req.query;

      if (!mes || !anio || isNaN(mes) || isNaN(anio) || mes < 1 || mes > 12) {
        return res.status(400).json({
          error:
            "Parámetros 'mes' (1-12) y 'anio' (YYYY) son requeridos y deben ser válidos.",
        });
      }

      const metrics = await pagoService.getMonthlyPaymentMetrics(
        parseInt(mes),
        parseInt(anio)
      );

      // Devolvemos las métricas con un mensaje claro
      res.status(200).json({
        message: `Métricas de Pagos para el mes ${mes}/${anio}.`,
        data: metrics,
      });
    } catch (error) {
      console.error("Error al obtener métricas mensuales:", error.message);
      res
        .status(500)
        .json({ error: "Error interno al procesar las métricas de pago." });
    }
  },

  /**
   * @async
   * @function getOnTimeRate
   * @description Obtiene la Tasa de Pagos a Tiempo para un mes/año.
   * @param {object} req - Query params: `mes` (1-12) y `anio` (YYYY).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async getOnTimeRate(req, res) {
    try {
      const { mes, anio } = req.query;

      if (!mes || !anio || isNaN(mes) || isNaN(anio) || mes < 1 || mes > 12) {
        return res.status(400).json({
          error:
            "Parámetros 'mes' (1-12) y 'anio' (YYYY) son requeridos y deben ser válidos.",
        });
      }

      const metrics = await pagoService.getOnTimePaymentRate(
        parseInt(mes),
        parseInt(anio)
      );

      res.status(200).json({
        message: `Tasa de Pagos a Tiempo para el mes ${mes}/${anio}.`,
        data: metrics,
      });
    } catch (error) {
      console.error(
        "Error al obtener la tasa de pagos a tiempo:",
        error.message
      );
      res.status(500).json({
        error: "Error interno al procesar la tasa de pagos a tiempo.",
      });
    }
  },
  /**
   * @async
   * @function generateAdvancePayments
   * @description Genera múltiples pagos por adelantado para una suscripción. (Admin/Sistema)
   * @param {object} req - Se espera req.body.id_suscripcion, req.body.cantidad_meses, [req.body.monto_por_mes].
   */
  async generateAdvancePayments(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id_suscripcion, cantidad_meses, monto_por_mes } = req.body;
      
      // La validación de parámetros (números, rangos) debe ir en el middleware de rutas (express-validator)

      const pagosGenerados = await pagoService.generarPagosAdelantados(
        id_suscripcion,
        cantidad_meses,
        monto_por_mes,
        { transaction: t }
      );

      await t.commit();
      
      return res.status(201).json({
        message: `Generados ${pagosGenerados.length} pagos adelantados para la suscripción ID ${id_suscripcion}.`,
        pagos: pagosGenerados.map(p => ({
          id: p.id,
          monto: p.monto,
          mes: p.mes,
          estado_pago: p.estado_pago
        }))
      });

    } catch (error) {
      await t.rollback();
      console.error("Error en generateAdvancePayments:", error.message);
      return res.status(400).json({ error: error.message || "Error al generar pagos adelantados." });
    }
  },
  /**
   * @async
   * @function getPendingPaymentsBySubscription
   * @description Obtiene todos los pagos pendientes o vencidos de una suscripción. (Admin)
   * @param {object} req - Se espera req.params.id_suscripcion.
   */
  async getPendingPaymentsBySubscription(req, res) {
    try {
      const id_suscripcion = parseInt(req.params.id_suscripcion);

      if (isNaN(id_suscripcion)) {
        return res.status(400).json({ error: "ID de suscripción inválido." });
      }

      const pagos = await pagoService.findPendingPaymentsBySubscription(id_suscripcion);
      
      return res.status(200).json({
        message: `Pagos pendientes/vencidos para la suscripción ID ${id_suscripcion}.`,
        data: pagos
      });
      
    } catch (error) {
      console.error("Error en getPendingPaymentsBySubscription:", error.message);
      res.status(500).json({ error: "Error al obtener pagos pendientes por suscripción." });
    }
  },
  /**
   * @async
   * @function updatePaymentAmount
   * @description Permite actualizar el monto de un pago PENDIENTE o VENCIDO. (Admin)
   * @param {object} req - Se espera req.params.id (ID de pago), req.body.monto y [req.body.motivo_cambio].
   */
  async updatePaymentAmount(req, res) {
    try {
      const pagoId = parseInt(req.params.id);
      // Usamos 'monto' en el body, en lugar de 'nuevo_monto' para simplificar el DTO
      const { monto, motivo_cambio } = req.body; 

      const pagoActualizado = await pagoService.actualizarMontoPago(
        pagoId,
        monto,
        motivo_cambio
      );

      return res.status(200).json({
        message: `Monto del Pago ID ${pagoId} actualizado a $${pagoActualizado.monto}.`,
        pago: {
          id: pagoActualizado.id,
          monto: pagoActualizado.monto,
          estado_pago: pagoActualizado.estado_pago,
          motivo_cambio: motivo_cambio || 'N/A'
        },
      });

    } catch (error) {
      console.error("Error en updatePaymentAmount:", error.message);
      return res.status(400).json({ error: error.message || "Error al actualizar el monto del pago." });
    }
  },
};

module.exports = pagoController;
