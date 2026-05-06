// Archivo: controllers/redireccion.controller.js

const transaccionService = require("../services/transaccion.service");
const Transaccion = require("../models/transaccion"); // 👈 Importar modelo
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080";

const redireccionController = {
  async handleFailure(req, res) {
    const transaccionId = req.params.id;
    try {
      await transaccionService.cancelarTransaccionPorUsuario(transaccionId);
      res.redirect(
        `${FRONTEND_URL}/payment-result/${transaccionId}?status=failure&message=Operación%20cancelada`,
      );
    } catch (error) {
      console.error(`Error en handleFailure: ${error.message}`);
      res.redirect(
        `${FRONTEND_URL}/payment-result/${transaccionId}?status=error&message=Error%20interno`,
      );
    }
  },

  async handleSuccess(req, res) {
    const transaccionId = req.params.id;
    try {
      // Obtener la transacción para saber su estado actual
      const transaccion = await Transaccion.findByPk(transaccionId);
      if (!transaccion) {
        return res.redirect(
          `${FRONTEND_URL}/payment-result/${transaccionId}?status=error&message=Transacción%20no%20encontrada`,
        );
      }

      let status = "pending";
      if (transaccion.estado_transaccion === "pagado") {
        status = "success";
      } else if (
        transaccion.estado_transaccion === "fallido" ||
        transaccion.estado_transaccion === "reembolsado"
      ) {
        status = "failure";
      } else {
        // pendiente, en_proceso, etc.
        status = "pending";
      }

      // Redirigir con el estado real (puede ser pending si el webhook aún no actualizó)
      res.redirect(
        `${FRONTEND_URL}/payment-result/${transaccionId}?status=${status}`,
      );
    } catch (error) {
      console.error(`Error en handleSuccess: ${error.message}`);
      res.redirect(
        `${FRONTEND_URL}/payment-result/${transaccionId}?status=error&message=Error%20al%20verificar%20pago`,
      );
    }
  },

  async handlePending(req, res) {
    const transaccionId = req.params.id;
    res.redirect(
      `${FRONTEND_URL}/payment-result/${transaccionId}?status=pending`,
    );
  },
};

module.exports = redireccionController;
