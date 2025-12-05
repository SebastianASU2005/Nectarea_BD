const verificacionIdentidadService = require("../services/verificacionIdentidad.service");
const { getIpAddress } = require("../utils/networkUtils");

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

      if (!tipo_documento || !numero_documento || !nombre_completo) {
        return res.status(400).json({
          success: false,
          tipo: "CAMPOS_REQUERIDOS",
          mensaje: "Campos obligatorios faltantes",
          detalles:
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

      const registro =
        await verificacionIdentidadService.submitVerificationData(
          id_usuario,
          submissionData,
          files
        );

      return res.status(202).json({
        success: true,
        mensaje: "Solicitud de verificación enviada con éxito",
        detalles:
          "Tu solicitud está pendiente de revisión por un administrador. Te notificaremos cuando sea procesada.",
        registro: {
          id: registro.id,
          estado_verificacion: registro.estado_verificacion,
          fecha_envio: registro.createdAt,
        },
      });
    } catch (error) {
      console.error("Error al enviar datos de verificación:", error);

      try {
        const errorData = JSON.parse(error.message);

        const statusCodeMap = {
          YA_VERIFICADO: 409,
          SOLICITUD_PENDIENTE: 409,
          ARCHIVOS_FALTANTES: 400,
        };

        const statusCode = statusCodeMap[errorData.tipo] || 400;

        return res.status(statusCode).json({
          success: false,
          ...errorData,
        });
      } catch (parseError) {
        const statusCode = error.message.includes("❌") ? 400 : 500;
        return res.status(statusCode).json({
          success: false,
          tipo: "ERROR_GENERAL",
          mensaje: error.message,
          detalles: null,
        });
      }
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
        return res.status(200).json({
          success: true,
          estado_verificacion: "NO_INICIADO",
          mensaje: "No has iniciado tu verificación de identidad",
          puede_enviar: true,
        });
      }

      const puede_enviar = registro.estado_verificacion === "RECHAZADA";

      return res.status(200).json({
        success: true,
        ...registro.toJSON(),
        puede_enviar,
        mensaje_estado: {
          PENDIENTE: "Tu solicitud está siendo revisada",
          APROBADA: "Tu identidad fue verificada exitosamente",
          RECHAZADA:
            "Tu solicitud fue rechazada. Puedes enviar nueva documentación",
        }[registro.estado_verificacion],
      });
    } catch (error) {
      console.error("Error al obtener estado de verificación:", error);
      return res.status(500).json({
        success: false,
        tipo: "ERROR_SERVIDOR",
        mensaje: "Error al consultar el estado de KYC",
        detalles: error.message,
      });
    }
  },

  /**
   * @route POST /api/kyc/approve/:idUsuario
   * @description Aprueba la verificación de un usuario (solo Admins).
   */
  async approveVerification(req, res) {
    try {
      const id_verificador = req.user.id;
      const id_usuario = parseInt(req.params.idUsuario);

      const registro =
        await verificacionIdentidadService.updateVerificationStatus(
          id_usuario,
          "APROBADA",
          id_verificador
        );

      return res.status(200).json({
        success: true,
        mensaje: `Verificación del usuario ${id_usuario} aprobada exitosamente`,
        registro: {
          id: registro.id,
          estado_verificacion: registro.estado_verificacion,
          fecha_verificacion: registro.fecha_verificacion,
        },
      });
    } catch (error) {
      console.error("Error al aprobar verificación:", error);
      const statusCode = error.message.includes("❌") ? 400 : 500;
      return res.status(statusCode).json({
        success: false,
        tipo: "ERROR_APROBACION",
        mensaje: error.message,
      });
    }
  },

  /**
   * @route POST /api/kyc/reject/:idUsuario
   * @description Rechaza la verificación de un usuario (solo Admins).
   */
  async rejectVerification(req, res) {
    try {
      const id_verificador = req.user.id;
      const id_usuario = parseInt(req.params.idUsuario);
      const { motivo_rechazo } = req.body;

      if (!motivo_rechazo) {
        return res.status(400).json({
          success: false,
          tipo: "CAMPO_REQUERIDO",
          mensaje: "El motivo de rechazo es obligatorio",
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
        success: true,
        mensaje: `Verificación del usuario ${id_usuario} rechazada`,
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
      return res.status(statusCode).json({
        success: false,
        tipo: "ERROR_RECHAZO",
        mensaje: error.message,
      });
    }
  },

  /**
   * @route GET /api/kyc/pending
   * @description Lista todas las solicitudes PENDIENTES (solo Admins).
   */
  async getPendingVerifications(req, res) {
    try {
      const pendientes =
        await verificacionIdentidadService.findPendingVerifications();
      return res.status(200).json({
        success: true,
        estado: "PENDIENTE",
        total: pendientes.length,
        solicitudes: pendientes,
      });
    } catch (error) {
      console.error("Error al listar pendientes:", error);
      return res.status(500).json({
        success: false,
        tipo: "ERROR_SERVIDOR",
        mensaje: "Error al listar verificaciones pendientes",
        detalles: error.message,
      });
    }
  },

  /**
   * @route GET /api/kyc/approved
   * @description Lista todas las solicitudes APROBADAS (solo Admins).
   */
  async getApprovedVerifications(req, res) {
    try {
      const aprobadas =
        await verificacionIdentidadService.findApprovedVerifications();
      return res.status(200).json({
        success: true,
        estado: "APROBADA",
        total: aprobadas.length,
        solicitudes: aprobadas,
      });
    } catch (error) {
      console.error("Error al listar aprobadas:", error);
      return res.status(500).json({
        success: false,
        tipo: "ERROR_SERVIDOR",
        mensaje: "Error al listar verificaciones aprobadas",
        detalles: error.message,
      });
    }
  },

  /**
   * @route GET /api/kyc/rejected
   * @description Lista todas las solicitudes RECHAZADAS (solo Admins).
   */
  async getRejectedVerifications(req, res) {
    try {
      const rechazadas =
        await verificacionIdentidadService.findRejectedVerifications();
      return res.status(200).json({
        success: true,
        estado: "RECHAZADA",
        total: rechazadas.length,
        solicitudes: rechazadas,
      });
    } catch (error) {
      console.error("Error al listar rechazadas:", error);
      return res.status(500).json({
        success: false,
        tipo: "ERROR_SERVIDOR",
        mensaje: "Error al listar verificaciones rechazadas",
        detalles: error.message,
      });
    }
  },

  /**
   * @route GET /api/kyc/all
   * @description Lista TODAS las verificaciones procesadas (APROBADAS + RECHAZADAS) (solo Admins).
   */
  async getAllProcessedVerifications(req, res) {
    try {
      const procesadas =
        await verificacionIdentidadService.findAllProcessedVerifications();

      // Contar por estado
      const stats = {
        aprobadas: procesadas.filter(
          (v) => v.estado_verificacion === "APROBADA"
        ).length,
        rechazadas: procesadas.filter(
          (v) => v.estado_verificacion === "RECHAZADA"
        ).length,
      };

      return res.status(200).json({
        success: true,
        total: procesadas.length,
        estadisticas: stats,
        solicitudes: procesadas,
      });
    } catch (error) {
      console.error("Error al listar todas las verificaciones:", error);
      return res.status(500).json({
        success: false,
        tipo: "ERROR_SERVIDOR",
        mensaje: "Error al listar todas las verificaciones",
        detalles: error.message,
      });
    }
  },
};

module.exports = verificacionIdentidadController;
