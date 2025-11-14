const inversionService = require("../services/inversion.service");
const TransaccionService = require("../services/transaccion.service");
const UsuarioService = require("../services/usuario.service");
const auth2faService = require("../services/auth2fa.service");

/**
 * Controlador de Express para gestionar el ciclo de vida de las Inversiones.
 * Incluye la creación inicial, el flujo de pago con 2FA y las operaciones CRUD.
 */
const inversionController = {
  // ===================================================================
  // CREACIÓN Y GESTIÓN INICIAL
  // ===================================================================

  /**
   * @async
   * @function create
   * @description Maneja la solicitud inicial para crear una inversión (registra el compromiso, estado: 'pendiente').
   * @param {object} req - Objeto de solicitud de Express (con datos de inversión en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async create(req, res) {
    try {
      if (req.user.rol === "admin") {
        return res.status(403).json({
          error:
            "⛔ Los administradores no pueden crear inversiones como clientes por motivos de seguridad.",
        });
      }
      const id_usuario = req.user.id;
      const data = { ...req.body, id_usuario };
      const nuevaInversion = await inversionService.crearInversion(data);

      res.status(201).json({
        message:
          "Inversión registrada con éxito. Por favor, proceda a la activación del pago.",
        inversionId: nuevaInversion.id,
        modelo: "Inversion",
        url_pago_sugerida: `/api/inversion/iniciar-pago/${nuevaInversion.id}`,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================
  // 🚀 FLUJO DE PAGO CON 2FA
  // ===================================================================

  /**
   * @async
   * @function requestCheckoutInversion
   * @description Inicia el proceso de checkout para una inversión pendiente.
   * Si el 2FA está activo para el usuario, detiene el flujo y solicita el código.
   * @param {object} req - Objeto de solicitud de Express (con `idInversion` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async requestCheckoutInversion(req, res) {
    try {
      const inversionId = req.params.idInversion;
      const userId = req.user.id;

      // 1. Validar la Inversión (existencia, propiedad, estado) y obtener el usuario
      const [inversion, user] = await Promise.all([
        inversionService.findById(inversionId),
        UsuarioService.findById(userId),
      ]);

      if (
        !inversion ||
        inversion.id_usuario !== userId ||
        inversion.estado !== "pendiente"
      ) {
        return res.status(403).json({
          error: "Inversión no válida, no pendiente o no te pertenece.",
        });
      }

      // 🛑 2. PUNTO DE CONTROL DE SEGURIDAD 2FA 🛑
      if (user && user.is_2fa_enabled) {
        // Retorna 202 Accepted para que el cliente solicite el código 2FA
        return res.status(202).json({
          message:
            "Se requiere verificación 2FA para iniciar el checkout de la inversión.",
          is2FARequired: true,
          inversionId: inversion.id,
        });
      }

      // 3. FLUJO NORMAL: Generar Transacción y Checkout (Si el 2FA no está activo)
      const { transaccion, redirectUrl } =
        await TransaccionService.iniciarTransaccionYCheckout(
          "inversion",
          inversion.id,
          userId
        );

      // 4. DEVOLVER DIRECTAMENTE LA URL DE REDIRECCIÓN
      res.status(200).json({
        message: `Transacción #${transaccion.id} creada. Redireccionando a la pasarela de pago.`,
        transaccionId: transaccion.id,
        inversionId: inversion.id,
        redirectUrl: redirectUrl,
      });
    } catch (error) {
      // Manejo de errores simplificado
      const status =
        error.message.includes("no encontrado") ||
        error.message.includes("Acceso denegado")
          ? 403
          : 400;
      res.status(status).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function confirmarInversionCon2FA
   * @description Verifica el código 2FA proporcionado por el usuario y, si es correcto,
   * genera la Transacción y el Checkout para la Inversión pendiente.
   * @param {object} req - Objeto de solicitud de Express (con `inversionId` y `codigo_2fa` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async confirmarInversionCon2FA(req, res) {
    try {
      const userId = req.user.id;
      const { inversionId, codigo_2fa } = req.body;

      // 1. Validar Inversión y Usuario (mismas validaciones de seguridad)
      const [user, inversion] = await Promise.all([
        UsuarioService.findById(userId),
        inversionService.findById(inversionId),
      ]);

      if (
        !user ||
        !inversion ||
        inversion.id_usuario !== userId ||
        inversion.estado !== "pendiente"
      ) {
        return res.status(403).json({
          error: "Inversión no válida, no pendiente o no te pertenece.",
        });
      }

      // 2. VERIFICACIÓN CRÍTICA DEL 2FA
      if (!user.is_2fa_enabled || !user.twofa_secret) {
        return res
          .status(403)
          .json({ error: "2FA no activo. Error de flujo." });
      }

      const isVerified = auth2faService.verifyToken(
        user.twofa_secret,
        codigo_2fa
      );

      if (!isVerified) {
        return res
          .status(401)
          .json({ error: "Código 2FA incorrecto. Inversión rechazada." });
      }

      // 3. 🚀 EJECUTAR LA LÓGICA DE PASARELA (Solo si el 2FA es correcto)
      const { transaccion, redirectUrl } =
        await TransaccionService.iniciarTransaccionYCheckout(
          "inversion",
          inversion.id,
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
  // FUNCIONES DE LECTURA (FIND)
  // ===================================================================

  /**
   * @async
   * @function findMyInversions
   * @description Obtiene todas las inversiones del usuario autenticado.
   */
  async findMyInversions(req, res) {
    try {
      const userId = req.user.id;
      const inversiones = await inversionService.findByUserId(userId);
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findAll
   * @description Obtiene todas las inversiones (para administradores).
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
   * @description Obtiene todas las inversiones activas (si aplica, para mostrar en un dashboard).
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
   * @description Obtiene una inversión por ID (para administradores).
   */
  async findById(req, res) {
    try {
      const { id } = req.params;
      const inversion = await inversionService.findById(id);
      if (!inversion) {
        return res.status(404).json({ message: "Inversión no encontrada" });
      }
      res.status(200).json(inversion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findMyInversionById
   * @description Obtiene una inversión por ID, verificando que pertenezca al usuario autenticado.
   */
  async findMyInversionById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const inversion = await inversionService.findByIdAndUserId(id, userId);
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

  // ===================================================================
  // FUNCIONES DE ACTUALIZACIÓN Y ELIMINACIÓN (UPDATE / DELETE)
  // ===================================================================

  /**
   * @async
   * @function update
   * @description Actualiza una inversión por ID (para administradores).
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const inversionActualizada = await inversionService.update(id, req.body);
      if (!inversionActualizada) {
        return res.status(404).json({ message: "Inversión no encontrada" });
      }
      res.status(200).json(inversionActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function updateMyInversion
   * @description Actualiza una inversión por ID, verificando propiedad.
   */
  async updateMyInversion(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const inversionActualizada = await inversionService.updateByIdAndUserId(
        id,
        userId,
        req.body
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
   * @description Elimina lógicamente una inversión (para administradores).
   */
  async softDelete(req, res) {
    try {
      const { id } = req.params;
      const inversionEliminada = await inversionService.softDelete(id);
      if (!inversionEliminada) {
        return res.status(404).json({ message: "Inversión no encontrada" });
      }
      res.status(204).send(); // 204 No Content para borrado exitoso
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function softDeleteMyInversion
   * @description Elimina lógicamente una inversión, verificando propiedad.
   */
  async softDeleteMyInversion(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const inversionEliminada = await inversionService.softDeleteByIdAndUserId(
        id,
        userId
      );
      if (!inversionEliminada) {
        return res
          .status(404)
          .json({ message: "Inversión no encontrada o no te pertenece." });
      }
      res.status(204).send(); // 204 No Content para borrado exitoso
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  // -------------------------------------------------------------------
  // 📊 NUEVAS FUNCIONES DE REPORTE/MÉTRICAS (ADMIN)
  // -------------------------------------------------------------------

  /**
   * @async
   * @function getLiquidityRate
   * @description Obtiene la Tasa de Liquidez de Inversiones (KPI 6).
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
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
      res.status(500).json({
        error: "Error interno al procesar las métricas de inversión.",
      });
    }
  },

  /**
   * @async
   * @function getAggregatedByUser
   * @description Obtiene el monto total invertido (pagado) por cada usuario.
   * (Base para KPI 7: Rendimiento del Inversor).
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
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
        error.message
      );
      res.status(500).json({
        error: "Error interno al procesar la agregación de inversiones.",
      });
    }
  },
};

module.exports = inversionController;
