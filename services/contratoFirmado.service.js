// services/contratoFirmadoService.js
const ContratoFirmado = require("../models/ContratoFirmado ");
const Inversion = require("../models/inversion");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");
const Pago = require("../models/Pago");
const verificacionIdentidadService = require("./verificacionIdentidad.service");

/**
 * Servicio de lógica de negocio para la gestión de Contratos Firmados.
 * AUTO-DETECCIÓN: Ya no requiere id_inversion o id_suscripcion del frontend.
 */
const contratoFirmadoService = {
  /**
   * @async
   * @function registerSignedContract
   * @description Registra la auditoría completa de un Contrato Firmado con AUTO-DETECCIÓN
   * de inversión o suscripción válida para el usuario y proyecto.
   * @param {object} signatureData - Datos requeridos para la firma (SIN id_inversion ni id_suscripcion).
   * @returns {Promise<ContratoFirmado>} El registro de auditoría creado.
   * @throws {Error} Si fallan las validaciones de negocio.
   */
  async registerSignedContract(signatureData) {
    const {
      id_usuario_firmante,
      id_proyecto,
      id_contrato_plantilla, // ✅ AHORA LO USAMOS PARA VALIDACIÓN
    } = signatureData;

    // 1. VERIFICACIÓN CRÍTICA: KYC
    const verificacionKYC =
      await verificacionIdentidadService.getVerificationStatus(
        id_usuario_firmante
      );

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

    // ✅ 2.5. VALIDACIÓN CRÍTICA NUEVA: Verificar que la plantilla pertenece al proyecto
    const ContratoPlantilla = require("../models/ContratoPlantilla");
    const plantilla = await ContratoPlantilla.findByPk(id_contrato_plantilla);

    if (!plantilla) {
      throw new Error("❌ La plantilla de contrato especificada no existe.");
    }

    // 🟢 CORRECCIÓN: Convertir a Número el id_proyecto que viene del body para la comparación
    const idProyectoNum = parseInt(id_proyecto);

    if (plantilla.id_proyecto !== idProyectoNum) {
      // 👈 Usar el valor convertido
      throw new Error(
        `❌ Error de seguridad: La plantilla de contrato (ID: ${id_contrato_plantilla}) no pertenece al proyecto "${proyecto.nombre_proyecto}" (ID: ${id_proyecto}). ` +
          `Esta plantilla está asociada al proyecto ID: ${
            plantilla.id_proyecto || "ninguno"
          }.`
      );
    }

    if (!plantilla.activo) {
      throw new Error(
        "❌ La plantilla de contrato seleccionada está inactiva y no puede ser utilizada."
      );
    }

    // 3. AUTO-DETECCIÓN: Buscar inversión o suscripción válida
    let inversionValida = null;
    let suscripcionValida = null;

    if (proyecto.tipo_inversion === "directo") {
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

    if (proyecto.tipo_inversion === "mensual") {
      const suscripcion = await SuscripcionProyecto.findOne({
        where: {
          id_usuario: id_usuario_firmante,
          id_proyecto: id_proyecto,
          activo: true,
        },
        order: [["id", "DESC"]],
      });

      if (suscripcion) {
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

    // 4. VALIDACIONES DE COHERENCIA
    if (!inversionValida && !suscripcionValida) {
      if (proyecto.tipo_inversion === "directo") {
        throw new Error(
          `❌ No se encontró una inversión pagada y activa para el proyecto "${proyecto.nombre_proyecto}". Debes completar el pago de tu inversión antes de firmar el contrato.`
        );
      } else {
        throw new Error(
          `❌ No se encontró una suscripción activa con el primer pago completado para el proyecto "${proyecto.nombre_proyecto}". Debes completar el pago inicial (Mes 1) antes de firmar el contrato.`
        );
      }
    }

    if (inversionValida && suscripcionValida) {
      throw new Error(
        "❌ Error de integridad: Se encontró tanto una inversión como una suscripción para este proyecto. Esto no debería ser posible. Contacta soporte."
      );
    }

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

    // 5. VERIFICAR QUE NO EXISTA YA UN CONTRATO FIRMADO
    if (inversionValida) {
      const contratoExistente = await ContratoFirmado.findOne({
        where: {
          id_inversion_asociada: inversionValida.id,
          estado_firma: "FIRMADO",
        },
      });

      if (contratoExistente) {
        throw new Error(
          "❌ Ya existe un contrato firmado para esta inversión. No se pueden firmar múltiples contratos."
        );
      }
    }

    if (suscripcionValida) {
      const contratoExistente = await ContratoFirmado.findOne({
        where: {
          id_suscripcion_asociada: suscripcionValida.id,
          estado_firma: "FIRMADO",
        },
      });

      if (contratoExistente) {
        throw new Error(
          "❌ Ya existe un contrato firmado para esta suscripción. No se pueden firmar múltiples contratos."
        );
      }
    }

    // 6. CREAR EL REGISTRO DE AUDITORÍA
    const newContract = await ContratoFirmado.create({
      ...signatureData,
      id_inversion_asociada: inversionValida ? inversionValida.id : null,
      id_suscripcion_asociada: suscripcionValida ? suscripcionValida.id : null,
      fecha_firma: new Date(),
    });

    return newContract;
  },
  /**
   * @async
   * @function findByUserId
   * @description Obtiene todos los contratos firmados válidos de un usuario específico.
   * @param {number} userId - ID del usuario firmante.
   * @returns {Promise<ContratoFirmado[]>} Lista de contratos firmados.
   */
  async findByUserId(userId) {
    return ContratoFirmado.findAll({
      where: {
        id_usuario_firmante: userId,
        activo: true,
      },
      order: [["id", "DESC"]],
    });
  },

  /**
   * @async
   * @function findByPk
   * @description Obtiene un contrato firmado por su ID.
   * @param {number} id - ID del contrato.
   * @returns {Promise<ContratoFirmado|null>} El contrato.
   */
  async findByPk(id) {
    return ContratoFirmado.findByPk(id);
  },

  /**
   * @async
   * @function softDelete
   * @description Revoca un contrato firmado (marca como REVOCADO).
   * @param {number} id - ID del contrato.
   * @returns {Promise<ContratoFirmado|null>} El contrato actualizado.
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
