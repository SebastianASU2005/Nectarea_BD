const pujaService = require("../services/puja.service");
const TransaccionService = require("../services/transaccion.service");
// 🛑 NUEVAS IMPORTACIONES REQUERIDAS 🛑
const UsuarioService = require("../services/usuario.service");
const auth2faService = require("../services/auth2fa.service");

const pujaController = {
  // Controlador para crear una nueva puja
  async create(req, res) {
    try {
      const id_usuario = req.user.id;
      const data = { ...req.body, id_usuario };
      const nuevaPuja = await pujaService.create(data);
      res.status(201).json(nuevaPuja);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }, // ===================================================================

  // 🚀 FUNCIÓN MODIFICADA: INICIAR CHECKOUT (Bifurcación 2FA para Puja) 🚦
  // ===================================================================
  async requestCheckout(req, res) {
    const pujaId = req.params.id;
    const userId = req.user.id;

    try {
      // 1. Validar el estado de la puja sin generar el checkout aún
      // Usaremos el servicio para obtener la puja y verificar que esté 'ganadora_pendiente'.
      const pujaValidada = await pujaService.getValidPaymentDetails(
        pujaId,
        userId
      );

      // 2. Obtener información del usuario para el 2FA
      const user = await UsuarioService.findById(userId);

      // 🛑 3. PUNTO DE CONTROL DE SEGURIDAD 2FA 🛑
      if (user && user.is_2fa_enabled) {
        // Si el 2FA está activo, detenemos la redirección y solicitamos el código.
        return res.status(202).json({
          message:
            "Puja ganadora. Se requiere verificación 2FA para generar el checkout.",
          is2FARequired: true,
          pujaId: pujaValidada.id,
        });
      } // 4. FLUJO NORMAL: Generar Checkout (Si el 2FA no está activo) // Delegación completa al servicio para generar Transacción y Checkout.

      const checkoutResult = await pujaService.requestCheckoutForPuja(
        pujaId,
        userId
      ); // 5. Retornar el URL de la pasarela de pago al cliente

      res.status(200).json({
        message: `Transacción creada exitosamente para Puja ID ${pujaId}. Redirigiendo a pasarela de pago.`,
        transaccion_id: checkoutResult.transaccion.id,
        url_checkout: checkoutResult.checkoutUrl,
      });
    } catch (error) {
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

  // ===================================================================
  // 🚀 NUEVA FUNCIÓN: VERIFICAR 2FA Y CONTINUAR CHECKOUT DE PUJA
  // ===================================================================
  async confirmarPujaCon2FA(req, res) {
    try {
      const userId = req.user.id;
      const { pujaId, codigo_2fa } = req.body;

      // 1. Validar la Puja y obtener el Usuario (se revalida el estado)
      const [user, puja] = await Promise.all([
        UsuarioService.findById(userId),
        pujaService.getValidPaymentDetails(pujaId, userId), // Reusa la validación de estado y propiedad
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
      // Llama al servicio que delega la generación de la Transacción y el Checkout.
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
      // Manejo de errores de validación de puja, 2FA, o la pasarela de pago.
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
  }, // **NUEVA FUNCIÓN** para gestionar la finalización de la subasta

  async manageAuctionEnd(req, res) {
    // ... (código existente) ...
    try {
      const { id_lote, id_ganador } = req.body;
      if (!id_lote || !id_ganador) {
        return res
          .status(400)
          .json({ error: "id_lote y id_ganador son obligatorios." });
      }
      await pujaService.gestionarTokensAlFinalizar(id_lote);
      res
        .status(200)
        .json({ message: "Tokens gestionados al finalizar la subasta." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }, // --- El resto de las funciones (findAll, findMyPujas, etc.) se mantienen igual ---

  async findAll(req, res) {
    try {
      const pujas = await pujaService.findAll();
      res.status(200).json(pujas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

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

  async findAllActivo(req, res) {
    try {
      const pujasActivas = await pujaService.findAllActivo();
      res.status(200).json(pujasActivas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findMyPujas(req, res) {
    try {
      const userId = req.user.id;
      const pujas = await pujaService.findByUserId(userId);
      res.status(200).json(pujas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

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
