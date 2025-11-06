// services/verificacionIdentidad.service.js
const VerificacionIdentidad = require("../models/verificacion_identidad");
const localFileStorageService = require("./localFileStorage.service");

const verificacionIdentidadService = {
  /**
   * @async
   * @function submitVerificationData
   * @description Registra la solicitud inicial de verificación de identidad.
   * 🚨 REGLA DE NEGOCIO: Solo se permite UNA solicitud PENDIENTE a la vez.
   * @param {number} id_usuario - ID del usuario.
   * @param {object} data - Datos de la verificación.
   * @param {object} files - Archivos subidos (Buffer de multer).
   * @returns {Promise<VerificacionIdentidad>} El registro creado o actualizado.
   * @throws {Error} Si ya existe una solicitud PENDIENTE.
   */
  async submitVerificationData(id_usuario, data, files) {
    // 1. VALIDACIÓN CRÍTICA: Verificar si ya existe una solicitud PENDIENTE
    const solicitudPendiente = await VerificacionIdentidad.findOne({
      where: {
        id_usuario,
        estado_verificacion: "PENDIENTE",
      },
    });

    if (solicitudPendiente) {
      throw new Error(
        "❌ Ya tienes una solicitud de verificación en proceso. Espera a que sea revisada antes de enviar una nueva."
      );
    }

    // 2. Validar archivos requeridos
    if (
      !files ||
      !files.documento_frente ||
      !files.documento_frente[0] ||
      !files.selfie_con_documento ||
      !files.selfie_con_documento[0]
    ) {
      throw new Error(
        "Se requieren las fotos del documento (frente) y la selfie con el documento."
      );
    }

    // 3. Subir archivos al almacenamiento local
    const timestamp = Date.now();
    const basePath = `kyc/${id_usuario}`;

    // Subir documento frente
    const documentoFrenteBuffer = files.documento_frente[0].buffer;
    const documentoFrentePath = `${basePath}/documento-frente-${timestamp}.${
      files.documento_frente[0].mimetype.split("/")[1]
    }`;
    const url_foto_documento_frente =
      await localFileStorageService.uploadBuffer(
        documentoFrenteBuffer,
        documentoFrentePath
      );

    // Subir documento dorso (opcional)
    let url_foto_documento_dorso = null;
    if (files.documento_dorso && files.documento_dorso[0]) {
      const documentoDorsoBuffer = files.documento_dorso[0].buffer;
      const documentoDorsoPath = `${basePath}/documento-dorso-${timestamp}.${
        files.documento_dorso[0].mimetype.split("/")[1]
      }`;
      url_foto_documento_dorso = await localFileStorageService.uploadBuffer(
        documentoDorsoBuffer,
        documentoDorsoPath
      );
    }

    // Subir selfie
    const selfieBuffer = files.selfie_con_documento[0].buffer;
    const selfiePath = `${basePath}/selfie-${timestamp}.${
      files.selfie_con_documento[0].mimetype.split("/")[1]
    }`;
    const url_foto_selfie_con_documento =
      await localFileStorageService.uploadBuffer(selfieBuffer, selfiePath);

    // Subir video (opcional)
    let url_video_verificacion = null;
    if (files.video_verificacion && files.video_verificacion[0]) {
      const videoBuffer = files.video_verificacion[0].buffer;
      const videoPath = `${basePath}/video-${timestamp}.${
        files.video_verificacion[0].mimetype.split("/")[1]
      }`;
      url_video_verificacion = await localFileStorageService.uploadBuffer(
        videoBuffer,
        videoPath
      );
    }

    // 4. Buscar registro existente (RECHAZADO o sin solicitud previa)
    let registro = await VerificacionIdentidad.findOne({
      where: { id_usuario },
    });

    const submissionData = {
      ...data,
      id_usuario,
      url_foto_documento_frente,
      url_foto_documento_dorso,
      url_foto_selfie_con_documento,
      url_video_verificacion,
      estado_verificacion: "PENDIENTE",
      // Resetear campos de verificación
      id_verificador: null,
      fecha_verificacion: null,
      motivo_rechazo: null,
    };

    if (registro) {
      // Si existe y está RECHAZADO, permitir actualización
      if (registro.estado_verificacion === "RECHAZADA") {
        registro = await registro.update(submissionData);
      } else if (registro.estado_verificacion === "APROBADA") {
        throw new Error(
          "❌ Tu verificación ya fue APROBADA. No puedes enviar una nueva solicitud."
        );
      }
    } else {
      // Crear nuevo registro
      registro = await VerificacionIdentidad.create(submissionData);
    }

    return registro;
  },

  /**
   * @async
   * @function getVerificationStatus
   * @description Obtiene el estado actual de la verificación de identidad.
   */
  async getVerificationStatus(id_usuario) {
    return VerificacionIdentidad.findOne({
      where: { id_usuario },
      attributes: {
        exclude: [
          "url_foto_documento_frente",
          "url_foto_documento_dorso",
          "url_foto_selfie_con_documento",
          "url_video_verificacion",
        ],
      },
    });
  },

  /**
   * @async
   * @function updateVerificationStatus
   * @description Aprueba o rechaza una solicitud de KYC.
   */
  async updateVerificationStatus(
    id_usuario,
    estado,
    id_verificador,
    motivo_rechazo = null
  ) {
    if (estado !== "APROBADA" && estado !== "RECHAZADA") {
      throw new Error(
        "Estado de verificación no válido. Debe ser 'APROBADA' o 'RECHAZADA'."
      );
    }

    if (
      estado === "RECHAZADA" &&
      (!motivo_rechazo || motivo_rechazo.trim() === "")
    ) {
      throw new Error(
        "El motivo de rechazo es obligatorio para rechazar la verificación."
      );
    }

    const registro = await VerificacionIdentidad.findOne({
      where: { id_usuario },
    });

    if (!registro) {
      throw new Error(
        "No se encontró solicitud de verificación para este usuario."
      );
    }

    if (registro.estado_verificacion !== "PENDIENTE") {
      throw new Error(
        `❌ Esta solicitud ya fue ${registro.estado_verificacion.toLowerCase()}. Solo se pueden revisar solicitudes PENDIENTES.`
      );
    }

    const updateData = {
      estado_verificacion: estado,
      id_verificador: id_verificador,
      fecha_verificacion: new Date(),
      motivo_rechazo: estado === "RECHAZADA" ? motivo_rechazo.trim() : null,
    };

    return registro.update(updateData);
  },

  /**
   * @async
   * @function findPendingVerifications
   * @description Obtiene todas las solicitudes PENDIENTES.
   */
  async findPendingVerifications() {
    return VerificacionIdentidad.findAll({
      where: {
        estado_verificacion: "PENDIENTE",
      },
      order: [["createdAt", "ASC"]], // Las más antiguas primero
    });
  },
};

module.exports = verificacionIdentidadService;