// controllers/verificacionIdentidad.controller.js
const verificacionIdentidadService = require("../services/verificacionIdentidad.service");
const { getIpAddress } = require("../utils/networkUtils");
const { formatErrorResponse } = require("../utils/responseUtils");

const verificacionIdentidadController = {
  /**
   * @route POST /api/kyc/submit
   * @description Envía los documentos para verificación KYC.
   */
  async submitVerificationData(req, res) {
    try {
      const id_usuario = req.user.id;

      const {
        tipo_documento,
        numero_documento,
        nombre_completo,
        fecha_nacimiento,
        latitud_verificacion,
        longitud_verificacion,
      } = req.body;

      const files = req.files;

      // Validación básica de campos requeridos
      if (!tipo_documento || !numero_documento || !nombre_completo) {
        return res.status(400).json({
          message:
            "Los campos tipo_documento, numero_documento y nombre_completo son obligatorios.",
        });
      }

      const ip_verificacion = getIpAddress(req);

      const submissionData = {
        tipo_documento,
        numero_documento,
        nombre_completo,
        fecha_nacimiento: fecha_nacimiento || null,
        latitud_verificacion: latitud_verificacion || null,
        longitud_verificacion: longitud_verificacion || null,
        ip_verificacion,
      };

      // El servicio maneja la subida de archivos y validaciones
      const registro =
        await verificacionIdentidadService.submitVerificationData(
          id_usuario,
          submissionData,
          files
        );

      return res.status(202).json({
        message:
          "✅ Solicitud de verificación enviada con éxito. Pendiente de revisión por un administrador.",
        registro: {
          id: registro.id,
          estado_verificacion: registro.estado_verificacion,
          fecha_envio: registro.createdAt,
        },
      });
    } catch (error) {
      console.error("Error al enviar datos de verificación:", error);
      const statusCode = error.message.includes("❌") ? 400 : 500;
      return res.status(statusCode).json(formatErrorResponse(error.message));
    }
  },

  /**
   * @route GET /api/kyc/status
   * @description Obtiene el estado de verificación del usuario actual.
   */
  async getVerificationStatus(req, res) {
    try {
      const id_usuario = req.user.id;
      const registro = await verificacionIdentidadService.getVerificationStatus(
        id_usuario
      );

      if (!registro) {
        return res.status(404).json({
          message: "No se ha iniciado la verificación de identidad.",
          estado_verificacion: "NO_INICIADO",
        });
      }

      return res.status(200).json(registro);
    } catch (error) {
      console.error("Error al obtener estado de verificación:", error);
      return res
        .status(500)
        .json(formatErrorResponse("Fallo al consultar el estado de KYC."));
    }
  },

  /**
   * @route POST /api/kyc/approve/:idUsuario
   * @description Aprueba la verificación de un usuario (solo Admins).
   */
  async approveVerification(req, res) {
    try {
      const id_verificador = req.user.id; // ✅ CORREGIDO: usar req.user.id
      const id_usuario = parseInt(req.params.idUsuario);

      const registro =
        await verificacionIdentidadService.updateVerificationStatus(
          id_usuario,
          "APROBADA",
          id_verificador
        );

      return res.status(200).json({
        message: `✅ Verificación del usuario ${id_usuario} APROBADA exitosamente.`,
        registro: {
          id: registro.id,
          estado_verificacion: registro.estado_verificacion,
          fecha_verificacion: registro.fecha_verificacion,
        },
      });
    } catch (error) {
      console.error("Error al aprobar verificación:", error);
      const statusCode = error.message.includes("❌") ? 400 : 500;
      return res.status(statusCode).json(formatErrorResponse(error.message));
    }
  },

  /**
   * @route POST /api/kyc/reject/:idUsuario
   * @description Rechaza la verificación de un usuario (solo Admins).
   */
  async rejectVerification(req, res) {
    try {
      const id_verificador = req.user.id; // ✅ CORREGIDO
      const id_usuario = parseInt(req.params.idUsuario);
      const { motivo_rechazo } = req.body;

      if (!motivo_rechazo) {
        return res.status(400).json({
          message: "El motivo de rechazo es obligatorio.",
        });
      }

      const registro =
        await verificacionIdentidadService.updateVerificationStatus(
          id_usuario,
          "RECHAZADA",
          id_verificador,
          motivo_rechazo
        );

      return res.status(200).json({
        message: `✅ Verificación del usuario ${id_usuario} RECHAZADA.`,
        registro: {
          id: registro.id,
          estado_verificacion: registro.estado_verificacion,
          motivo_rechazo: registro.motivo_rechazo,
          fecha_verificacion: registro.fecha_verificacion,
        },
      });
    } catch (error) {
      console.error("Error al rechazar verificación:", error);
      const statusCode =
        error.message.includes("❌") || error.message.includes("No se encontró")
          ? 400
          : 500;
      return res.status(statusCode).json(formatErrorResponse(error.message));
    }
  },

  /**
   * @route GET /api/kyc/pending
   * @description Lista todas las solicitudes pendientes (solo Admins).
   */
  async getPendingVerifications(req, res) {
    try {
      const pendientes =
        await verificacionIdentidadService.findPendingVerifications();
      return res.status(200).json({
        total: pendientes.length,
        solicitudes: pendientes,
      });
    } catch (error) {
      console.error("Error al listar pendientes:", error);
      return res
        .status(500)
        .json(
          formatErrorResponse("Fallo al listar verificaciones pendientes.")
        );
    }
  },
};

module.exports = verificacionIdentidadController;
