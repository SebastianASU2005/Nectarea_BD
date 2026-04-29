// services/contratoFirmadoService.js
const { Op } = require("sequelize");
const ContratoFirmado = require("../models/ContratoFirmado");
const Inversion = require("../models/inversion");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");
const Pago = require("../models/pago");
const Usuario = require("../models/usuario");
const verificacionIdentidadService = require("./verificacionIdentidad.service");
const ContratoPlantilla = require("../models/ContratoPlantilla");
const Adhesion = require("../models/adhesion");

/**
 * Servicio de lógica de negocio para la gestión de Contratos Firmados (Registro de Auditoría).
 * Implementa la **AUTO-DETECCIÓN** de la Inversión o Suscripción válida asociada al contrato.
 */
const contratoFirmadoService = {
  async registerSignedContract(signatureData) {
    const { id_usuario_firmante, id_proyecto, id_contrato_plantilla } =
      signatureData;

    const usuario =
      await require("./usuario.service").findById(id_usuario_firmante);
    if (usuario && usuario.rol === "admin") {
      throw new Error(
        "⛔ Los administradores no pueden firmar contratos como clientes.",
      );
    }

    // 1. VERIFICACIÓN CRÍTICA: Estatus de Verificación de Identidad (KYC).
    const verificacionKYC =
      await verificacionIdentidadService.getVerificationStatus(
        id_usuario_firmante,
      );
    if (
      !verificacionKYC ||
      verificacionKYC.estado_verificacion !== "APROBADA"
    ) {
      throw new Error(
        "❌ Firma rechazada: El usuario no ha completado o aprobado la Verificación de Identidad (KYC).",
      );
    }

    // 2. OBTENER Y VALIDAR EL PROYECTO
    const proyecto = await Proyecto.findByPk(id_proyecto);
    if (!proyecto) throw new Error("❌ El proyecto especificado no existe.");

    // 3. VALIDAR PLANTILLA
    const plantilla = await ContratoPlantilla.findByPk(id_contrato_plantilla);
    if (!plantilla)
      throw new Error("❌ La plantilla de contrato especificada no existe.");
    if (plantilla.id_proyecto !== parseInt(id_proyecto)) {
      throw new Error(
        `❌ Error de seguridad: La plantilla de contrato (ID: ${id_contrato_plantilla}) no pertenece al proyecto "${proyecto.nombre_proyecto}".`,
      );
    }
    if (!plantilla.activo) {
      throw new Error(
        "❌ La plantilla de contrato seleccionada está inactiva y no puede ser utilizada.",
      );
    }

    // 4. AUTO-DETECCIÓN DE ENTIDAD VÁLIDA
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
      // 🔥 NUEVO: Buscar una suscripción activa asociada a una adhesión con al menos una cuota pagada
      // Primero, obtener las adhesiones del usuario en este proyecto con cuotas_pagadas > 0
      const adhesion = await Adhesion.findOne({
        where: {
          id_usuario: id_usuario_firmante,
          id_proyecto: id_proyecto,
          cuotas_pagadas: { [Op.gt]: 0 },
          estado: { [Op.in]: ["en_curso", "completada"] },
        },
        order: [["id", "DESC"]],
      });

      if (adhesion && adhesion.id_suscripcion) {
        const suscripcion = await SuscripcionProyecto.findOne({
          where: {
            id: adhesion.id_suscripcion,
            activo: true,
          },
        });
        if (suscripcion) {
          suscripcionValida = suscripcion;
        }
      }
    }

    // 5. VALIDACIONES DE COHERENCIA
    if (!inversionValida && !suscripcionValida) {
      if (proyecto.tipo_inversion === "directo") {
        throw new Error(
          `❌ Debes completar el pago de tu inversión antes de firmar el contrato para el proyecto "${proyecto.nombre_proyecto}".`,
        );
      } else {
        throw new Error(
          `❌ Para proyectos mensuales, debes haber pagado al menos una cuota de tu adhesión antes de firmar el contrato.`,
        );
      }
    }

    if (inversionValida && suscripcionValida) {
      throw new Error(
        "❌ Error de integridad: Se encontró una inversión Y una suscripción. Contacta soporte.",
      );
    }

    // 6. VERIFICAR QUE NO EXISTA YA UN CONTRATO FIRMADO
    if (inversionValida) {
      const contratoExistente = await ContratoFirmado.findOne({
        where: {
          id_inversion_asociada: inversionValida.id,
          estado_firma: "FIRMADO",
        },
      });
      if (contratoExistente)
        throw new Error(
          "❌ Ya existe un contrato firmado para esta inversión.",
        );
    }
    if (suscripcionValida) {
      const contratoExistente = await ContratoFirmado.findOne({
        where: {
          id_suscripcion_asociada: suscripcionValida.id,
          estado_firma: "FIRMADO",
        },
      });
      if (contratoExistente)
        throw new Error(
          "❌ Ya existe un contrato firmado para esta suscripción.",
        );
    }

    // 7. CREAR EL REGISTRO DE AUDITORÍA
    const newContract = await ContratoFirmado.create({
      ...signatureData,
      id_inversion_asociada: inversionValida ? inversionValida.id : null,
      id_suscripcion_asociada: suscripcionValida ? suscripcionValida.id : null,
      fecha_firma: new Date(),
    });

    return newContract;
  },
  /**
   * Valida si el usuario es elegible para firmar un contrato (sin crear registro).
   * Ahora incluye la validación de adhesión con al menos una cuota pagada.
   */
  async validateContractEligibility(data) {
    const { id_usuario_firmante, id_proyecto, id_contrato_plantilla } = data;

    const usuario =
      await require("./usuario.service").findById(id_usuario_firmante);
    if (usuario && usuario.rol === "admin") {
      throw new Error(
        "⛔ Los administradores no pueden firmar contratos como clientes.",
      );
    }

    // KYC
    const verificacionKYC =
      await verificacionIdentidadService.getVerificationStatus(
        id_usuario_firmante,
      );
    if (
      !verificacionKYC ||
      verificacionKYC.estado_verificacion !== "APROBADA"
    ) {
      throw new Error(
        "❌ Firma rechazada: El usuario no ha completado o aprobado la Verificación de Identidad (KYC).",
      );
    }

    // Proyecto
    const proyecto = await Proyecto.findByPk(id_proyecto);
    if (!proyecto) throw new Error("❌ El proyecto especificado no existe.");

    // Plantilla
    const plantilla = await ContratoPlantilla.findByPk(id_contrato_plantilla);
    if (!plantilla)
      throw new Error("❌ La plantilla de contrato especificada no existe.");
    if (plantilla.id_proyecto !== parseInt(id_proyecto)) {
      throw new Error(
        `❌ Error de seguridad: La plantilla no pertenece al proyecto.`,
      );
    }
    if (!plantilla.activo) throw new Error("❌ La plantilla está inactiva.");

    // Auto-detección
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
      const adhesion = await Adhesion.findOne({
        where: {
          id_usuario: id_usuario_firmante,
          id_proyecto: id_proyecto,
          cuotas_pagadas: { [Op.gt]: 0 },
          estado: { [Op.in]: ["en_curso", "completada"] },
        },
        order: [["id", "DESC"]],
      });
      if (adhesion && adhesion.id_suscripcion) {
        suscripcionValida = await SuscripcionProyecto.findOne({
          where: { id: adhesion.id_suscripcion, activo: true },
        });
      }
    }

    if (!inversionValida && !suscripcionValida) {
      if (proyecto.tipo_inversion === "directo") {
        throw new Error(
          `❌ Debes completar el pago de tu inversión antes de firmar.`,
        );
      } else {
        throw new Error(
          `❌ Debes pagar al menos una cuota de tu adhesión antes de firmar el contrato.`,
        );
      }
    }

    if (inversionValida && suscripcionValida)
      throw new Error("❌ Inconsistencia de entidades.");
    if (inversionValida && proyecto.tipo_inversion !== "directo")
      throw new Error("❌ Inconsistencia de tipo.");
    if (suscripcionValida && proyecto.tipo_inversion !== "mensual")
      throw new Error("❌ Inconsistencia de tipo.");

    // Verificar duplicado
    if (inversionValida) {
      const contratoExistente = await ContratoFirmado.findOne({
        where: {
          id_inversion_asociada: inversionValida.id,
          estado_firma: "FIRMADO",
        },
      });
      if (contratoExistente)
        throw new Error("❌ Ya existe contrato firmado para esta inversión.");
    }
    if (suscripcionValida) {
      const contratoExistente = await ContratoFirmado.findOne({
        where: {
          id_suscripcion_asociada: suscripcionValida.id,
          estado_firma: "FIRMADO",
        },
      });
      if (contratoExistente)
        throw new Error("❌ Ya existe contrato firmado para esta suscripción.");
    }

    return { inversionValida, suscripcionValida, proyecto };
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
        activo: true,
      },
      include: [
        {
          model: Usuario,
          as: "usuarioFirmante",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoAsociado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
          ],
        },
      ],
      order: [["id", "DESC"]],
    });
  },

  /**
   * Obtiene todos los contratos firmados con información de usuario y proyecto.
   * @returns {Promise<ContratoFirmado[]>} Lista de todos los contratos firmados.
   */
  async findAll() {
    return ContratoFirmado.findAll({
      include: [
        {
          model: Usuario,
          as: "usuarioFirmante",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoAsociado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
          ],
        },
      ],
      order: [["id", "DESC"]],
    });
  },
  /**
   * Obtiene una plantilla de contrato por su ID.
   * @param {number} id - ID de la plantilla.
   * @returns {Promise<ContratoPlantilla|null>} La plantilla encontrada.
   */
  async getPlantillaById(id) {
    return ContratoPlantilla.findByPk(id);
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
  /**
   * Rastrea el estado de pago y firma de un usuario para un proyecto.
   * Útil para el frontend: saber si el usuario pagó la adhesión y si ya firmó el contrato.
   *
   * @param {number} userId - ID del usuario
   * @param {number} projectId - ID del proyecto
   * @returns {Promise<object>} Estado del pago y contrato firmado (si existe)
   */
  async trackPaymentAndContract(userId, projectId) {
    const proyecto = await Proyecto.findByPk(projectId, {
      attributes: [
        "id",
        "nombre_proyecto",
        "tipo_inversion",
        "estado_proyecto",
      ],
    });

    if (!proyecto) {
      throw new Error("❌ Proyecto no encontrado.");
    }

    // ─── CASO: Inversión directa ───────────────────────────────────────────────
    if (proyecto.tipo_inversion === "directo") {
      const inversion = await Inversion.findOne({
        where: {
          id_usuario: userId,
          id_proyecto: projectId,
          estado: "pagado",
          activo: true,
        },
        order: [["id", "DESC"]],
      });

      if (!inversion) {
        return {
          tiene_pago: false,
          tiene_contrato_firmado: false,
          puede_firmar: false,
          entidad_pagadora: null,
          contrato_firmado: null,
          proyecto: {
            id: proyecto.id,
            nombre: proyecto.nombre_proyecto,
            tipo_inversion: proyecto.tipo_inversion,
          },
          mensaje:
            "El usuario aún no tiene un pago confirmado para este proyecto.",
        };
      }

      const contratoFirmado = await ContratoFirmado.findOne({
        where: {
          id_inversion_asociada: inversion.id,
          estado_firma: "FIRMADO",
        },
        attributes: [
          "id",
          "nombre_archivo",
          "url_archivo",
          "fecha_firma",
          "estado_firma",
          "id_contrato_plantilla",
          "id_proyecto",
        ],
      });

      return {
        tiene_pago: true,
        tiene_contrato_firmado: !!contratoFirmado,
        puede_firmar: !contratoFirmado,
        entidad_pagadora: {
          tipo: "inversion",
          id: inversion.id,
          monto: inversion.monto,
          fecha: inversion.fecha_inversion,
          estado: inversion.estado,
        },
        contrato_firmado: contratoFirmado
          ? {
              id: contratoFirmado.id,
              nombre_archivo: contratoFirmado.nombre_archivo,
              url_archivo: contratoFirmado.url_archivo,
              fecha_firma: contratoFirmado.fecha_firma,
              estado_firma: contratoFirmado.estado_firma,
              id_contrato_plantilla: contratoFirmado.id_contrato_plantilla,
            }
          : null,
        proyecto: {
          id: proyecto.id,
          nombre: proyecto.nombre_proyecto,
          tipo_inversion: proyecto.tipo_inversion,
        },
        mensaje: contratoFirmado
          ? "El usuario ya tiene un contrato firmado para este proyecto."
          : "El usuario tiene un pago confirmado pero aún no firmó el contrato.",
      };
    }

    // ─── CASO: Suscripción mensual ─────────────────────────────────────────────
    if (proyecto.tipo_inversion === "mensual") {
      // 1. Buscar todas las suscripciones activas del usuario en este proyecto
      const suscripciones = await SuscripcionProyecto.findAll({
        where: {
          id_usuario: userId,
          id_proyecto: projectId,
          activo: true,
        },
        order: [["id", "DESC"]], // más reciente primero
      });

      if (suscripciones.length === 0) {
        return {
          tiene_pago: false,
          tiene_contrato_firmado: false,
          puede_firmar: false,
          entidad_pagadora: null,
          contrato_firmado: null,
          suscripciones_detalle: [],
          proyecto: {
            id: proyecto.id,
            nombre: proyecto.nombre_proyecto,
            tipo_inversion: proyecto.tipo_inversion,
          },
          mensaje:
            "El usuario no tiene suscripciones activas en este proyecto.",
        };
      }

      // 2. Para cada suscripción, verificar si tiene al menos una cuota de adhesión pagada
      const suscripcionesDetalle = [];
      let algunaConPagoAdhesion = false;
      let algunaConContrato = false;
      let suscripcionPendienteFirma = null;

      for (const suscripcion of suscripciones) {
        // Buscar la adhesión asociada a esta suscripción
        const adhesion = await Adhesion.findOne({
          where: {
            id_suscripcion: suscripcion.id,
            cuotas_pagadas: { [Op.gt]: 0 }, // al menos una cuota pagada
            estado: { [Op.in]: ["en_curso", "completada"] },
          },
          order: [["id", "DESC"]],
        });

        const tienePagoAdhesion = !!adhesion;
        if (tienePagoAdhesion) algunaConPagoAdhesion = true;

        let contratoFirmado = null;
        if (tienePagoAdhesion) {
          contratoFirmado = await ContratoFirmado.findOne({
            where: {
              id_suscripcion_asociada: suscripcion.id,
              estado_firma: "FIRMADO",
            },
            attributes: [
              "id",
              "nombre_archivo",
              "url_archivo",
              "fecha_firma",
              "estado_firma",
              "id_contrato_plantilla",
              "id_proyecto",
            ],
          });
        }

        const tieneContrato = !!contratoFirmado;
        if (tieneContrato) algunaConContrato = true;

        const puedeFirmar = tienePagoAdhesion && !tieneContrato;
        if (puedeFirmar && !suscripcionPendienteFirma) {
          suscripcionPendienteFirma = {
            suscripcion_id: suscripcion.id,
            adhesion_id: adhesion.id,
            adhesion_estado: adhesion.estado,
            cuotas_pagadas: adhesion.cuotas_pagadas,
            cuotas_totales: adhesion.cuotas_totales,
          };
        }

        suscripcionesDetalle.push({
          suscripcion_id: suscripcion.id,
          adhesion_id: adhesion ? adhesion.id : null,
          tiene_pago_adhesion: tienePagoAdhesion,
          cuotas_pagadas: adhesion ? adhesion.cuotas_pagadas : 0,
          cuotas_totales: adhesion ? adhesion.cuotas_totales : 0,
          adhesion_estado: adhesion ? adhesion.estado : null,
          tiene_contrato_firmado: tieneContrato,
          puede_firmar: puedeFirmar,
          contrato_firmado: contratoFirmado
            ? {
                id: contratoFirmado.id,
                nombre_archivo: contratoFirmado.nombre_archivo,
                url_archivo: contratoFirmado.url_archivo,
                fecha_firma: contratoFirmado.fecha_firma,
                estado_firma: contratoFirmado.estado_firma,
                id_contrato_plantilla: contratoFirmado.id_contrato_plantilla,
              }
            : null,
        });
      }

      // Construir mensaje según el estado
      let mensaje = "";
      if (suscripcionPendienteFirma) {
        mensaje = algunaConContrato
          ? `El usuario tiene al menos una suscripción con contrato firmado y otra con pago de adhesión pendiente de firma.`
          : "El usuario ha pagado al menos una cuota de adhesión y puede firmar el contrato.";
      } else if (algunaConContrato) {
        mensaje =
          "El usuario ya tiene un contrato firmado para todas las suscripciones con pago de adhesión.";
      } else if (!algunaConPagoAdhesion) {
        mensaje =
          "El usuario aún no ha pagado ninguna cuota de adhesión. No puede firmar el contrato.";
      } else {
        mensaje =
          "El usuario tiene pago de adhesión pero todas las suscripciones ya tienen contrato firmado.";
      }

      return {
        tiene_pago: algunaConPagoAdhesion, // ✅ indica si pagó al menos una cuota de adhesión
        tiene_contrato_firmado: algunaConContrato,
        puede_firmar: !!suscripcionPendienteFirma,
        // entidad_pagadora apunta a la suscripción/adhesión que necesita firma (si existe)
        entidad_pagadora: suscripcionPendienteFirma
          ? {
              tipo: "suscripcion",
              id: suscripcionPendienteFirma.suscripcion_id,
              adhesion_id: suscripcionPendienteFirma.adhesion_id,
              adhesion_estado: suscripcionPendienteFirma.adhesion_estado,
              cuotas_pagadas: suscripcionPendienteFirma.cuotas_pagadas,
              cuotas_totales: suscripcionPendienteFirma.cuotas_totales,
            }
          : null,
        contrato_firmado:
          suscripcionesDetalle.find((s) => s.contrato_firmado)
            ?.contrato_firmado || null,
        suscripciones_detalle: suscripcionesDetalle,
        proyecto: {
          id: proyecto.id,
          nombre: proyecto.nombre_proyecto,
          tipo_inversion: proyecto.tipo_inversion,
        },
        mensaje,
      };
    }
  },
};

module.exports = contratoFirmadoService;
