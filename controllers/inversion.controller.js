// Archivo: controllers/inversion.controller.js

const inversionService = require("../services/inversion.service");
const TransaccionService = require("../services/transaccion.service");
const UsuarioService = require("../services/usuario.service");
const auth2faService = require("../services/auth2fa.service");

/**
 * Controlador de Express para gestionar el ciclo de vida de las Inversiones.
 * Incluye la creación inicial, el flujo de pago con 2FA obligatorio y las operaciones CRUD.
 */
const inversionController = {
  // ===================================================================
  // PASO 1: CREAR INVERSIÓN EN PENDIENTE
  // ===================================================================

  /**
   * @async
   * @function create
   * @description Registra una inversión en estado "pendiente".
   * No procesa ningún pago — solo compromete la intención de inversión.
   * El pago se completa en el endpoint POST /pagar con verificación 2FA.
   */
  async create(req, res) {
    try {
      if (req.user.rol === "admin") {
        return res.status(403).json({
          error:
            "Los administradores no pueden crear inversiones como clientes.",
        });
      }

      const nuevaInversion = await inversionService.crearInversion({
        ...req.body,
        id_usuario: req.user.id,
      });

      return res.status(201).json({
        message: "Inversión registrada. Procedé al pago con tu código 2FA.",
        inversionId: nuevaInversion.id,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================
  // PASO 2: VERIFICAR 2FA Y GENERAR CHECKOUT
  // ===================================================================

  /**
   * @async
   * @function iniciarPago
   * @description Verifica el código 2FA y, si es correcto, crea la transacción
   * y devuelve la URL de la pasarela de pago.
   * El 2FA es obligatorio — si el usuario no lo tiene activo, se bloquea el pago.
   * @body { inversionId, codigo_2fa }
   */
  async iniciarPago(req, res) {
    try {
      const userId = req.user.id;
      const { inversionId, codigo_2fa } = req.body;

      if (!inversionId || !codigo_2fa) {
        return res.status(400).json({
          error: "Se requieren inversionId y codigo_2fa.",
        });
      }

      // 1. Cargar inversión y usuario en paralelo
      const [inversion, user] = await Promise.all([
        inversionService.findById(inversionId),
        UsuarioService.findById(userId),
      ]);

      // 2. Validar que la inversión existe, pertenece al usuario y está pendiente
      if (
        !inversion ||
        inversion.id_usuario !== userId ||
        inversion.estado !== "pendiente"
      ) {
        return res.status(403).json({
          error: "Inversión no válida, no pendiente o no te pertenece.",
        });
      }

      // 3. Bloquear si el usuario no tiene 2FA activo — es obligatorio para invertir
      if (!user.is_2fa_enabled || !user.twofa_secret) {
        return res.status(403).json({
          error:
            "Debés activar la verificación en dos pasos (2FA) antes de realizar una inversión.",
          is2FARequired: true,
        });
      }

      // 4. Verificar el código 2FA
      const isVerified = auth2faService.verifyToken(
        user.twofa_secret,
        codigo_2fa,
      );
      if (!isVerified) {
        return res.status(401).json({ error: "Código 2FA incorrecto." });
      }

      // 5. Crear transacción y obtener URL de la pasarela
      const { transaccion, redirectUrl } =
        await TransaccionService.iniciarTransaccionYCheckout(
          "inversion",
          inversion.id,
          userId,
        );

      return res.status(200).json({
        message: `Transacción #${transaccion.id} creada. Redirigiendo a la pasarela.`,
        transaccionId: transaccion.id,
        redirectUrl,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================
  // LECTURA
  // ===================================================================

  /**
   * @async
   * @function findMyInversions
   * @description Obtiene todas las inversiones del usuario autenticado.
   */
  async findMyInversions(req, res) {
    try {
      const inversiones = await inversionService.findByUserId(req.user.id);
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findMyInversionById
   * @description Obtiene una inversión por ID verificando que pertenezca al usuario autenticado.
   */
  async findMyInversionById(req, res) {
    try {
      const inversion = await inversionService.findByIdAndUserId(
        req.params.id,
        req.user.id,
      );
      if (!inversion) {
        return res
          .status(404)
          .json({ message: "Inversión no encontrada o no te pertenece." });
      }
      res.status(200).json(inversion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findAll
   * @description Obtiene todas las inversiones. Solo para administradores.
   */
  async findAll(req, res) {
    try {
      const inversiones = await inversionService.findAll();
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todas las inversiones activas. Solo para administradores.
   */
  async findAllActivo(req, res) {
    try {
      const inversiones = await inversionService.findAllActivo();
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findById
   * @description Obtiene una inversión por ID. Solo para administradores.
   */
  async findById(req, res) {
    try {
      const inversion = await inversionService.findById(req.params.id);
      if (!inversion) {
        return res.status(404).json({ message: "Inversión no encontrada." });
      }
      res.status(200).json(inversion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // ACTUALIZACIÓN Y ELIMINACIÓN
  // ===================================================================

  /**
   * @async
   * @function update
   * @description Actualiza una inversión por ID. Solo para administradores.
   */
  async update(req, res) {
    try {
      const inversionActualizada = await inversionService.update(
        req.params.id,
        req.body,
      );
      if (!inversionActualizada) {
        return res.status(404).json({ message: "Inversión no encontrada." });
      }
      res.status(200).json(inversionActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function updateMyInversion
   * @description Actualiza una inversión verificando que pertenezca al usuario autenticado.
   */
  async updateMyInversion(req, res) {
    try {
      const inversionActualizada = await inversionService.updateByIdAndUserId(
        req.params.id,
        req.user.id,
        req.body,
      );
      if (!inversionActualizada) {
        return res
          .status(404)
          .json({ message: "Inversión no encontrada o no te pertenece." });
      }
      res.status(200).json(inversionActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function softDelete
   * @description Eliminación lógica de una inversión por ID. Solo para administradores.
   */
  async softDelete(req, res) {
    try {
      const inversionEliminada = await inversionService.softDelete(
        req.params.id,
      );
      if (!inversionEliminada) {
        return res.status(404).json({ message: "Inversión no encontrada." });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function softDeleteMyInversion
   * @description Eliminación lógica de una inversión verificando que pertenezca al usuario autenticado.
   */
  async softDeleteMyInversion(req, res) {
    try {
      const inversionEliminada = await inversionService.softDeleteByIdAndUserId(
        req.params.id,
        req.user.id,
      );
      if (!inversionEliminada) {
        return res
          .status(404)
          .json({ message: "Inversión no encontrada o no te pertenece." });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // MÉTRICAS Y REPORTES (ADMIN)
  // ===================================================================

  /**
   * @async
   * @function getLiquidityRate
   * @description Obtiene la Tasa de Liquidez de Inversiones (KPI 6).
   */
  async getLiquidityRate(req, res) {
    try {
      const metrics = await inversionService.getInvestmentLiquidityRate();
      res.status(200).json({
        mensaje:
          "Tasa de Liquidez de Inversiones (Total Pagado vs. Total Registrado).",
        data: metrics,
      });
    } catch (error) {
      console.error("Error al obtener Tasa de Liquidez:", error.message);
      res
        .status(500)
        .json({
          error: "Error interno al procesar las métricas de inversión.",
        });
    }
  },

  /**
   * @async
   * @function getAggregatedByUser
   * @description Obtiene el monto total invertido (pagado) por cada usuario (base para KPI 7).
   */
  async getAggregatedByUser(req, res) {
    try {
      const aggregated = await inversionService.getAggregatedInvestmentByUser();
      res.status(200).json({
        mensaje: "Monto total invertido (pagado) por cada usuario.",
        data: aggregated,
      });
    } catch (error) {
      console.error(
        "Error al obtener inversión agregada por usuario:",
        error.message,
      );
      res.status(500).json({
        error: "Error interno al procesar la agregación de inversiones.",
      });
    }
  },
};

module.exports = inversionController;
