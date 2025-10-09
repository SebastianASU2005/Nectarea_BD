const inversionService = require("../services/inversion.service");
const TransaccionService = require("../services/transaccion.service");
const UsuarioService = require("../services/usuario.service");
const auth2faService = require("../services/auth2fa.service");

const inversionController = {
  // Maneja la solicitud inicial para crear una inversión (solo registro pendiente)
  async create(req, res) {
    try {
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
  // 🚀 NUEVA FUNCIÓN: INICIAR CHECKOUT (Bifurcación 2FA para Inversión) 🚦
  // ===================================================================
  async requestCheckoutInversion(req, res) {
    try {
      const inversionId = req.params.idInversion;
      const userId = req.user.id;

      // 1. Validar la Inversión y obtener el usuario
      const [inversion, user] = await Promise.all([
        inversionService.findById(inversionId), // Se asume que este método funciona
        UsuarioService.findById(userId),
      ]);

      if (
        !inversion ||
        inversion.id_usuario !== userId ||
        inversion.estado !== "pendiente"
      ) {
        return res
          .status(403)
          .json({
            error: "Inversión no válida, no pendiente o no te pertenece.",
          });
      }

      // 🛑 2. PUNTO DE CONTROL DE SEGURIDAD 2FA 🛑
      if (user && user.is_2fa_enabled) {
        // Si el 2FA está activo, detenemos la redirección y solicitamos el código.
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
      const status =
        error.message.includes("no encontrado") ||
        error.message.includes("Acceso denegado")
          ? 403
          : 400;
      res.status(status).json({ error: error.message });
    }
  },

  // ===================================================================
  // 🚀 NUEVA FUNCIÓN: VERIFICAR 2FA Y CONTINUAR CHECKOUT DE INVERSIÓN
  // ===================================================================
  async confirmarInversionCon2FA(req, res) {
    try {
      const userId = req.user.id;
      const { inversionId, codigo_2fa } = req.body;

      // 1. Validar Inversión y Usuario
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
        return res
          .status(403)
          .json({
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
  }, // --- El resto de las funciones (findMyInversions, findAll, etc.) se mantienen igual ---

  async findMyInversions(req, res) {
    try {
      const userId = req.user.id;
      const inversiones = await inversionService.findByUserId(userId);
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAll(req, res) {
    try {
      const inversiones = await inversionService.findAll();
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAllActivo(req, res) {
    try {
      const inversiones = await inversionService.findAllActivo();
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

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
  async softDelete(req, res) {
    try {
      const { id } = req.params;
      const inversionEliminada = await inversionService.softDelete(id);
      if (!inversionEliminada) {
        return res.status(404).json({ message: "Inversión no encontrada" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
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
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = inversionController;
