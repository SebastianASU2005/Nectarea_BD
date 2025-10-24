const pujaService = require("../services/puja.service");
const TransaccionService = require("../services/transaccion.service");
// 🛑 NUEVAS IMPORTACIONES REQUERIDAS PARA 2FA 🛑
const UsuarioService = require("../services/usuario.service");
const auth2faService = require("../services/auth2fa.service");

/**
 * Controlador de Express para gestionar las Pujas en subastas, incluyendo la creación,
 * el acceso a la información y el proceso de pago con un punto de control 2FA.
 */
const pujaController = {
  /**
   * @async
   * @function create
   * @description Crea una nueva puja.
   * @param {object} req - Objeto de solicitud de Express (contiene `req.user.id`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async create(req, res) {
    try {
      const id_usuario = req.user.id;
      const data = { ...req.body, id_usuario };
      const nuevaPuja = await pujaService.create(data);
      res.status(201).json(nuevaPuja);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================

  /**
   * @async
   * @function requestCheckout
   * @description Inicia el proceso de checkout para pagar una puja ganadora.
   * Si el 2FA está activo para el usuario, devuelve un código 202 para solicitar el código 2FA.
   * @param {object} req - Contiene el ID de la puja en `params` y el ID del usuario en `req.user`.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async requestCheckout(req, res) {
    const pujaId = req.params.id;
    const userId = req.user.id;

    try {
      // 1. Validar el estado de la puja (debe ser 'ganadora_pendiente' y pertenecer al usuario)
      const pujaValidada = await pujaService.getValidPaymentDetails(
        pujaId,
        userId
      );

      // 2. Obtener información del usuario para el 2FA
      const user = await UsuarioService.findById(userId);

      // 🛑 3. PUNTO DE CONTROL DE SEGURIDAD 2FA 🛑
      if (user && user.is_2fa_enabled) {
        // Se detiene el flujo de checkout, se confirman los datos de la puja y se solicita el código.
        return res.status(202).json({
          message:
            "Puja ganadora. Se requiere verificación 2FA para generar el checkout.",
          is2FARequired: true,
          pujaId: pujaValidada.id,
        });
      }

      // 4. FLUJO NORMAL: Generar Checkout (Si el 2FA no está activo)
      // Llama al servicio para crear la Transacción y obtener la URL de pago.
      const checkoutResult = await pujaService.requestCheckoutForPuja(
        pujaId,
        userId
      );

      // 5. Retornar el URL de la pasarela de pago al cliente
      res.status(200).json({
        message: `Transacción creada exitosamente para Puja ID ${pujaId}. Redirigiendo a pasarela de pago.`,
        transaccion_id: checkoutResult.transaccion.id,
        url_checkout: checkoutResult.checkoutUrl,
      });
    } catch (error) {
      const message = error.message;

      // Manejo específico de errores de acceso y estado de puja
      if (
        message.includes("Acceso denegado") ||
        message.includes("no encontrada")
      ) {
        return res.status(403).json({ error: message });
      }
      if (message.includes("no está en estado")) {
        return res.status(409).json({ error: message });
      }

      res.status(400).json({ error: message });
    }
  },

  // ===================================================================

  /**
   * @async
   * @function confirmarPujaCon2FA
   * @description Verifica el código 2FA para una puja ganadora pendiente y, si es correcto,
   * continúa con la generación del checkout de pago.
   * @param {object} req - Contiene el ID de la puja y el código 2FA en `body`.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async confirmarPujaCon2FA(req, res) {
    try {
      const userId = req.user.id;
      const { pujaId, codigo_2fa } = req.body;

      // 1. Validar Usuario y Puja (se revalida el estado y la propiedad)
      const [user, puja] = await Promise.all([
        UsuarioService.findById(userId),
        pujaService.getValidPaymentDetails(pujaId, userId),
      ]);

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
          .json({ error: "Código 2FA incorrecto. Puja rechazada." });
      }

      // 3. 🚀 EJECUTAR LA LÓGICA DE PASARELA (Solo si el 2FA es correcto)
      const checkoutResult = await pujaService.requestCheckoutForPuja(
        pujaId,
        userId
      );

      // 4. Respuesta de Éxito: Devolver la URL de redirección
      res.status(200).json({
        message: `Verificación 2FA exitosa. Transacción #${checkoutResult.transaccion.id} creada. Redireccionando a la pasarela.`,
        transaccion_id: checkoutResult.transaccion.id,
        url_checkout: checkoutResult.checkoutUrl,
      });
    } catch (error) {
      // Manejo de errores (similar a requestCheckout)
      const message = error.message;
      if (
        message.includes("Acceso denegado") ||
        message.includes("no encontrada")
      ) {
        return res.status(403).json({ error: message });
      }
      if (message.includes("no está en estado")) {
        return res.status(409).json({ error: message });
      }
      res.status(400).json({ error: message });
    }
  },

  /**
   * @async
   * @function manageAuctionEnd
   * @description Función administrativa para gestionar el fin de una subasta y la gestión de tokens.
   * @param {object} req - Objeto de solicitud de Express (contiene `id_lote` y `id_ganador`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async manageAuctionEnd(req, res) {
    try {
      const { id_lote, id_ganador } = req.body;
      if (!id_lote || !id_ganador) {
        return res
          .status(400)
          .json({ error: "id_lote y id_ganador son obligatorios." });
      }
      // Llama al servicio para ejecutar la lógica de negocio al finalizar la subasta
      await pujaService.gestionarTokensAlFinalizar(id_lote);
      res
        .status(200)
        .json({ message: "Tokens gestionados al finalizar la subasta." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // --- Funciones CRUD de Lectura y Eliminación Lógica ---

  /**
   * @async
   * @function findAll
   * @description Obtiene todas las pujas (para administradores).
   */
  async findAll(req, res) {
    try {
      const pujas = await pujaService.findAll();
      res.status(200).json(pujas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findById
   * @description Obtiene una puja por ID (para administradores).
   */
  async findById(req, res) {
    try {
      const { id } = req.params;
      const puja = await pujaService.findById(id);
      if (!puja) {
        return res.status(404).json({ error: "Puja no encontrada." });
      }
      res.status(200).json(puja);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todas las pujas activas.
   */
  async findAllActivo(req, res) {
    try {
      const pujasActivas = await pujaService.findAllActivo();
      res.status(200).json(pujasActivas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findMyPujas
   * @description Obtiene todas las pujas del usuario autenticado.
   */
  async findMyPujas(req, res) {
    try {
      const userId = req.user.id;
      const pujas = await pujaService.findByUserId(userId);
      res.status(200).json(pujas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findMyPujaById
   * @description Obtiene una puja por ID, verificando que pertenezca al usuario autenticado.
   */
  async findMyPujaById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const puja = await pujaService.findByIdAndUserId(id, userId);
      if (!puja) {
        return res
          .status(404)
          .json({ error: "Puja no encontrada o no te pertenece." });
      }
      res.status(200).json(puja);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function update
   * @description Actualiza una puja por ID (para administradores).
   */
  async update(req, res) {
    try {
      const pujaActualizada = await pujaService.update(req.params.id, req.body);
      if (!pujaActualizada) {
        return res.status(404).json({ error: "Puja no encontrada" });
      }
      res.status(200).json(pujaActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function updateMyPuja
   * @description Actualiza una puja por ID, verificando que pertenezca al usuario autenticado.
   */
  async updateMyPuja(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const pujaActualizada = await pujaService.updateByIdAndUserId(
        id,
        userId,
        req.body
      );
      if (!pujaActualizada) {
        return res
          .status(404)
          .json({ error: "Puja no encontrada o no te pertenece." });
      }
      res.status(200).json(pujaActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function softDelete
   * @description Elimina lógicamente una puja por ID (para administradores).
   */
  async softDelete(req, res) {
    try {
      const pujaEliminada = await pujaService.softDelete(req.params.id);
      if (!pujaEliminada) {
        return res.status(404).json({ error: "Puja no encontrada" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function softDeleteMyPuja
   * @description Elimina lógicamente una puja por ID, verificando que pertenezca al usuario autenticado.
   */
  async softDeleteMyPuja(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const pujaEliminada = await pujaService.softDeleteByIdAndUserId(
        id,
        userId
      );
      if (!pujaEliminada) {
        return res
          .status(404)
          .json({ error: "Puja no encontrada o no te pertenece." });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = pujaController;
