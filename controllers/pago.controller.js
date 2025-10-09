// Archivo: controllers/pago.controller.js

const pagoService = require("../services/pago.service");
const transaccionService = require("../services/transaccion.service");
// 🛑 NUEVAS IMPORTACIONES REQUERIDAS PARA LA LÓGICA 2FA 🛑
const auth2faService = require("../services/auth2fa.service");
const usuarioService = require("../services/usuario.service");

const pagoController = {
  // ===================================================================
  // FUNCIÓN EXISTENTE: CREAR PAGO
  // ===================================================================
  async create(req, res) {
    try {
      const nuevoPago = await pagoService.create(req.body);
      res.status(201).json(nuevoPago);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================
  // FUNCIÓN EXISTENTE: ENCONTRAR MIS PAGOS
  // ===================================================================
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
  async requestCheckout(req, res) {
    try {
      const pagoId = req.params.id;
      const userId = req.user.id;

      // 1. Validar el pago y obtener el usuario
      const [pagoValidado, user] = await Promise.all([
        pagoService.getValidPaymentDetails(pagoId, userId),
        usuarioService.findById(userId),
      ]);

      // 🛑 2. PUNTO DE CONTROL DE SEGURIDAD 2FA 🛑
      if (user.is_2fa_enabled) {
        // Si el 2FA está activo, detenemos la redirección y solicitamos el código.
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
  async confirmarPagoYContinuar(req, res) {
    try {
      const userId = req.user.id;
      const { pagoId, codigo_2fa } = req.body;

      // 1. Obtener y validar datos
      const [user, pagoValidado] = await Promise.all([
        usuarioService.findById(userId),
        pagoService.getValidPaymentDetails(pagoId, userId), // Reutilizamos la validación de propiedad y estado
      ]);

      if (!user.is_2fa_enabled || !user.twofa_secret) {
        return res
          .status(403)
          .json({
            error:
              "2FA no activo o error de flujo. Intente el checkout normal.",
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
      const pago = await pagoService.findById(req.params.id);
      if (!pago) {
        return res.status(404).json({ error: "Pago no encontrado." });
      }
      res.status(200).json(pago);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
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
  async triggerManualPayment(req, res, next) {
    try {
      const { id_suscripcion } = req.body;
      if (!id_suscripcion) {
        return res
          .status(400)
          .json({ message: "El id_suscripcion es requerido." });
      }
      const nuevoPago = await pagoService.generarPagoMensualConDescuento(
        id_suscripcion
      );
      if (nuevoPago.message) {
        return res.status(200).json(nuevoPago);
      }

      res.status(201).json({
        message: "Pago mensual simulado y creado exitosamente.",
        pago: nuevoPago,
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = pagoController;
