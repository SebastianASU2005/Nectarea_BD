// services/contratoFirmadoService.js
const ContratoFirmado = require("../models/ContratoFirmado ");
const Inversion = require("../models/inversion");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");
const Pago = require("../models/Pago");
const verificacionIdentidadService = require("./verificacionIdentidad.service");
const ContratoPlantilla = require("../models/ContratoPlantilla"); // Importación necesaria para la validación

/**
 * Servicio de lógica de negocio para la gestión de Contratos Firmados (Registro de Auditoría).
 * Implementa la **AUTO-DETECCIÓN** de la Inversión o Suscripción válida asociada al contrato.
 */
const contratoFirmadoService = {
  /**
   * Registra la auditoría completa de un Contrato Firmado.
   * La función realiza validaciones críticas de KYC, coherencia y auto-detección
   * de la entidad de negocio (Inversión o Suscripción) asociada a la firma.
   * @param {object} signatureData - Datos de la firma del contrato.
   * @returns {Promise<ContratoFirmado>} El registro de auditoría creado.
   * @throws {Error} Si fallan las validaciones de negocio o seguridad.
   */
  async registerSignedContract(signatureData) {
    const { id_usuario_firmante, id_proyecto, id_contrato_plantilla } =
      signatureData;
    const usuario = await require("./usuario.service").findById(
      id_usuario_firmante
    );
    if (usuario && usuario.rol === "admin") {
      throw new Error(
        "⛔ Los administradores no pueden firmar contratos como clientes."
      );
    }
    // 1. VERIFICACIÓN CRÍTICA: Estatus de Verificación de Identidad (KYC).
    const verificacionKYC =
      await verificacionIdentidadService.getVerificationStatus(
        id_usuario_firmante
      );

    // Valida que el usuario tenga el KYC aprobado para proceder con la firma de un documento legal.
    if (
      !verificacionKYC ||
      verificacionKYC.estado_verificacion !== "APROBADA"
    ) {
      throw new Error(
        "❌ Firma rechazada: El usuario no ha completado o aprobado la Verificación de Identidad (KYC)."
      );
    }

    // 2. OBTENER Y VALIDAR EL PROYECTO
    const proyecto = await Proyecto.findByPk(id_proyecto);
    if (!proyecto) {
      throw new Error("❌ El proyecto especificado no existe.");
    }

    // 2.5. VALIDACIÓN CRÍTICA DE SEGURIDAD: Verificar que la plantilla pertenezca al proyecto.
    const plantilla = await ContratoPlantilla.findByPk(id_contrato_plantilla);

    if (!plantilla) {
      throw new Error("❌ La plantilla de contrato especificada no existe.");
    }

    // Asegura la comparación de tipos de datos para la validación de seguridad.
    const idProyectoNum = parseInt(id_proyecto);

    if (plantilla.id_proyecto !== idProyectoNum) {
      throw new Error(
        `❌ Error de seguridad: La plantilla de contrato (ID: ${id_contrato_plantilla}) no pertenece al proyecto "${proyecto.nombre_proyecto}".`
      );
    }

    // Valida que la plantilla que se intenta firmar esté activa.
    if (!plantilla.activo) {
      throw new Error(
        "❌ La plantilla de contrato seleccionada está inactiva y no puede ser utilizada."
      );
    }

    // 3. AUTO-DETECCIÓN: Buscar la Inversión o Suscripción válida asociada al usuario/proyecto.
    let inversionValida = null;
    let suscripcionValida = null;

    // Lógica para proyectos de Inversión Directa.
    if (proyecto.tipo_inversion === "directo") {
      // Busca la última inversión activa y **pagada** del usuario en este proyecto.
      inversionValida = await Inversion.findOne({
        where: {
          id_usuario: id_usuario_firmante,
          id_proyecto: id_proyecto,
          estado: "pagado",
          activo: true,
        },
        order: [["id", "DESC"]],
      });
    }

    // Lógica para proyectos de Inversión Mensual (Suscripción).
    if (proyecto.tipo_inversion === "mensual") {
      // Busca la suscripción activa más reciente del usuario.
      const suscripcion = await SuscripcionProyecto.findOne({
        where: {
          id_usuario: id_usuario_firmante,
          id_proyecto: id_proyecto,
          activo: true,
        },
        order: [["id", "DESC"]],
      });

      if (suscripcion) {
        // Valida que el primer pago (Mes 1) de la suscripción esté completado.
        const primerPago = await Pago.findOne({
          where: {
            id_suscripcion: suscripcion.id,
            mes: 1,
            estado_pago: "pagado",
          },
        });

        if (primerPago) {
          suscripcionValida = suscripcion;
        }
      }
    }

    // 4. VALIDACIONES DE COHERENCIA DE NEGOCIO

    // Requiere que se encuentre **exactamente una** entidad válida (Inversión o Suscripción).
    if (!inversionValida && !suscripcionValida) {
      // Retorna mensajes de error específicos según el tipo de proyecto.
      if (proyecto.tipo_inversion === "directo") {
        throw new Error(
          `❌ Debes completar el pago de tu inversión antes de firmar el contrato para el proyecto "${proyecto.nombre_proyecto}".`
        );
      } else {
        throw new Error(
          `❌ Debes tener una suscripción activa con el pago inicial (Mes 1) completado para el proyecto "${proyecto.nombre_proyecto}".`
        );
      }
    }

    // Valida que no se hayan encontrado ambas entidades (Inversión y Suscripción) a la vez (error de integridad del sistema).
    if (inversionValida && suscripcionValida) {
      throw new Error(
        "❌ Error de integridad: Se encontró una inversión Y una suscripción. Contacta soporte."
      );
    }

    // Valida que la entidad encontrada coincida con el tipo de proyecto (coherencia de datos).
    if (inversionValida && proyecto.tipo_inversion !== "directo") {
      throw new Error(
        `❌ Inconsistencia: Se encontró una inversión, pero el proyecto "${proyecto.nombre_proyecto}" no es de tipo 'directo'.`
      );
    }

    if (suscripcionValida && proyecto.tipo_inversion !== "mensual") {
      throw new Error(
        `❌ Inconsistencia: Se encontró una suscripción, pero el proyecto "${proyecto.nombre_proyecto}" no es de tipo 'mensual'.`
      );
    }

    // 5. VERIFICAR QUE NO EXISTA YA UN CONTRATO FIRMADO para la entidad encontrada.

    // Si es Inversión, verifica que no haya un contrato FIRMADO asociado a esa inversión.
    if (inversionValida) {
      const contratoExistente = await ContratoFirmado.findOne({
        where: {
          id_inversion_asociada: inversionValida.id,
          estado_firma: "FIRMADO",
        },
      });

      if (contratoExistente) {
        throw new Error(
          "❌ Ya existe un contrato firmado para esta inversión."
        );
      }
    }

    // Si es Suscripción, verifica que no haya un contrato FIRMADO asociado a esa suscripción.
    if (suscripcionValida) {
      const contratoExistente = await ContratoFirmado.findOne({
        where: {
          id_suscripcion_asociada: suscripcionValida.id,
          estado_firma: "FIRMADO",
        },
      });

      if (contratoExistente) {
        throw new Error(
          "❌ Ya existe un contrato firmado para esta suscripción."
        );
      }
    }

    // 6. CREAR EL REGISTRO DE AUDITORÍA con las IDs auto-detectadas.
    const newContract = await ContratoFirmado.create({
      ...signatureData,
      // Asigna la ID de la Inversión o Suscripción según la auto-detección.
      id_inversion_asociada: inversionValida ? inversionValida.id : null,
      id_suscripcion_asociada: suscripcionValida ? suscripcionValida.id : null,
      fecha_firma: new Date(),
    });

    return newContract;
  },

  /**
   * Obtiene todos los contratos firmados válidos (activos) de un usuario específico.
   * @param {number} userId - ID del usuario firmante.
   * @returns {Promise<ContratoFirmado[]>} Lista de contratos firmados del usuario.
   */
  async findByUserId(userId) {
    return ContratoFirmado.findAll({
      where: {
        id_usuario_firmante: userId,
        activo: true, // Solo contratos no revocados
      },
      order: [["id", "DESC"]],
    });
  },

  /**
   * Obtiene un contrato firmado por su ID (primary key).
   * @param {number} id - ID del contrato.
   * @returns {Promise<ContratoFirmado|null>} El contrato.
   */
  async findByPk(id) {
    return ContratoFirmado.findByPk(id);
  },

  /**
   * Revoca un contrato firmado (eliminación lógica).
   * Marca el contrato como `REVOCADO` y cambia su estado a inactivo (`activo: false`).
   * @param {number} id - ID del contrato.
   * @returns {Promise<ContratoFirmado|null>} El contrato con el estado actualizado.
   */
  async softDelete(id) {
    const contrato = await ContratoFirmado.findByPk(id);
    if (!contrato) return null;

    return contrato.update({
      estado_firma: "REVOCADO",
      activo: false,
    });
  },
};

module.exports = contratoFirmadoService;
