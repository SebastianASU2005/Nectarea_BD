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
   * @throws {Error} Si ya existe una solicitud PENDIENTE o APROBADA.
   */
  async submitVerificationData(id_usuario, data, files) {
    // 🔍 DEBUGGING: Ver qué archivos llegaron
    console.log(
      "📦 Files recibidos:",
      JSON.stringify(
        {
          filesKeys: files ? Object.keys(files) : "files is null/undefined",
          documento_frente: files?.documento_frente ? "exists" : "missing",
          documento_frente_length: files?.documento_frente?.length,
          selfie_con_documento: files?.selfie_con_documento
            ? "exists"
            : "missing",
          selfie_length: files?.selfie_con_documento?.length,
        },
        null,
        2
      )
    );

    // 1. 🔍 VERIFICACIÓN MEJORADA: Consultar estado actual del usuario
    const registroExistente = await VerificacionIdentidad.findOne({
      where: { id_usuario },
    });

    // 🎯 CASO 1: Ya tiene verificación APROBADA
    if (
      registroExistente &&
      registroExistente.estado_verificacion === "APROBADA"
    ) {
      throw new Error(
        JSON.stringify({
          tipo: "YA_VERIFICADO",
          mensaje: "Tu identidad ya fue verificada exitosamente.",
          detalles:
            "No es necesario enviar nueva documentación. Tu cuenta ya está completamente verificada.",
          estado_actual: "APROBADA",
          fecha_verificacion: registroExistente.fecha_verificacion,
        })
      );
    }

    // 🎯 CASO 2: Ya tiene una solicitud PENDIENTE
    if (
      registroExistente &&
      registroExistente.estado_verificacion === "PENDIENTE"
    ) {
      throw new Error(
        JSON.stringify({
          tipo: "SOLICITUD_PENDIENTE",
          mensaje: "Ya tienes una solicitud de verificación en proceso.",
          detalles:
            "Por favor espera a que un administrador revise tu documentación antes de enviar una nueva solicitud.",
          estado_actual: "PENDIENTE",
          fecha_envio: registroExistente.createdAt,
        })
      );
    }

    // 🎯 CASO 3: Puede enviar (primera vez o después de rechazo)
    const esPrimeraVez = !registroExistente;
    const esReintento =
      registroExistente &&
      registroExistente.estado_verificacion === "RECHAZADA";

    if (esReintento) {
      console.log(
        `🔄 Usuario ${id_usuario} está reenviando después de rechazo. Motivo anterior: ${registroExistente.motivo_rechazo}`
      );
    }

    // 2. Validar archivos requeridos
    if (!files) {
      throw new Error(
        JSON.stringify({
          tipo: "ARCHIVOS_FALTANTES",
          mensaje: "No se recibieron archivos.",
          detalles:
            "Asegúrate de enviar los documentos requeridos: foto frontal del documento y selfie con documento.",
        })
      );
    }

    // Validación más detallada
    const errores = [];

    if (!files.documento_frente || !files.documento_frente[0]) {
      errores.push("documento_frente (foto frontal del documento)");
    }

    if (!files.selfie_con_documento || !files.selfie_con_documento[0]) {
      errores.push("selfie_con_documento (selfie sosteniendo el documento)");
    }

    if (errores.length > 0) {
      throw new Error(
        JSON.stringify({
          tipo: "ARCHIVOS_FALTANTES",
          mensaje: "Faltan archivos obligatorios",
          detalles: `Los siguientes archivos son requeridos: ${errores.join(
            ", "
          )}`,
          archivos_faltantes: errores,
        })
      );
    }

    // 3. Subir archivos al almacenamiento local
    const timestamp = Date.now();
    const basePath = `kyc/${id_usuario}`;

    // Subir documento frente
    const documentoFrenteBuffer = files.documento_frente[0].buffer;
    const documentoFrenteExt = files.documento_frente[0].mimetype.split("/")[1];
    const documentoFrentePath = `${basePath}/documento-frente-${timestamp}.${documentoFrenteExt}`;

    console.log(`📤 Subiendo documento frente: ${documentoFrentePath}`);
    const url_foto_documento_frente =
      await localFileStorageService.uploadBuffer(
        documentoFrenteBuffer,
        documentoFrentePath
      );

    // Subir documento dorso (opcional)
    let url_foto_documento_dorso = null;
    if (files.documento_dorso && files.documento_dorso[0]) {
      const documentoDorsoBuffer = files.documento_dorso[0].buffer;
      const documentoDorsoExt = files.documento_dorso[0].mimetype.split("/")[1];
      const documentoDorsoPath = `${basePath}/documento-dorso-${timestamp}.${documentoDorsoExt}`;

      console.log(`📤 Subiendo documento dorso: ${documentoDorsoPath}`);
      url_foto_documento_dorso = await localFileStorageService.uploadBuffer(
        documentoDorsoBuffer,
        documentoDorsoPath
      );
    }

    // Subir selfie
    const selfieBuffer = files.selfie_con_documento[0].buffer;
    const selfieExt = files.selfie_con_documento[0].mimetype.split("/")[1];
    const selfiePath = `${basePath}/selfie-${timestamp}.${selfieExt}`;

    console.log(`📤 Subiendo selfie: ${selfiePath}`);
    const url_foto_selfie_con_documento =
      await localFileStorageService.uploadBuffer(selfieBuffer, selfiePath);

    // Subir video (opcional)
    let url_video_verificacion = null;
    if (files.video_verificacion && files.video_verificacion[0]) {
      const videoBuffer = files.video_verificacion[0].buffer;
      const videoExt = files.video_verificacion[0].mimetype.split("/")[1];
      const videoPath = `${basePath}/video-${timestamp}.${videoExt}`;

      console.log(`📤 Subiendo video: ${videoPath}`);
      url_video_verificacion = await localFileStorageService.uploadBuffer(
        videoBuffer,
        videoPath
      );
    }

    // 4. Crear o actualizar registro
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

    let registro;

    if (registroExistente) {
      // Actualizar registro rechazado
      console.log(
        `✅ Actualizando registro rechazado para usuario ${id_usuario}`
      );
      registro = await registroExistente.update(submissionData);
    } else {
      // Crear nuevo registro
      console.log(`✅ Creando nuevo registro KYC para usuario ${id_usuario}`);
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
