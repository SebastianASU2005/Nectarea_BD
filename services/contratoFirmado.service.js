// services/contratoFirmadoService.js
const ContratoFirmado = require("../models/ContratoFirmado");
const Inversion = require("../models/inversion");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");
const Pago = require("../models/pago");
const Usuario = require("../models/usuario");
const verificacionIdentidadService = require("./verificacionIdentidad.service");
const ContratoPlantilla = require("../models/ContratoPlantilla");

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
    if (!proyecto) {
      throw new Error("❌ El proyecto especificado no existe.");
    }

    // 2.5. VALIDACIÓN CRÍTICA DE SEGURIDAD: Verificar que la plantilla pertenezca al proyecto.
    const plantilla = await ContratoPlantilla.findByPk(id_contrato_plantilla);

    if (!plantilla) {
      throw new Error("❌ La plantilla de contrato especificada no existe.");
    }

    const idProyectoNum = parseInt(id_proyecto);

    if (plantilla.id_proyecto !== idProyectoNum) {
      throw new Error(
        `❌ Error de seguridad: La plantilla de contrato (ID: ${id_contrato_plantilla}) no pertenece al proyecto "${proyecto.nombre_proyecto}".`,
      );
    }

    if (!plantilla.activo) {
      throw new Error(
        "❌ La plantilla de contrato seleccionada está inactiva y no puede ser utilizada.",
      );
    }

    // 3. AUTO-DETECCIÓN: Buscar la Inversión o Suscripción válida asociada al usuario/proyecto.
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

    // 4. VALIDACIONES DE COHERENCIA DE NEGOCIO
    if (!inversionValida && !suscripcionValida) {
      if (proyecto.tipo_inversion === "directo") {
        throw new Error(
          `❌ Debes completar el pago de tu inversión antes de firmar el contrato para el proyecto "${proyecto.nombre_proyecto}".`,
        );
      } else {
        throw new Error(
          `❌ Debes tener una suscripción activa con el pago inicial (Mes 1) completado para el proyecto "${proyecto.nombre_proyecto}".`,
        );
      }
    }

    if (inversionValida && suscripcionValida) {
      throw new Error(
        "❌ Error de integridad: Se encontró una inversión Y una suscripción. Contacta soporte.",
      );
    }

    if (inversionValida && proyecto.tipo_inversion !== "directo") {
      throw new Error(
        `❌ Inconsistencia: Se encontró una inversión, pero el proyecto "${proyecto.nombre_proyecto}" no es de tipo 'directo'.`,
      );
    }

    if (suscripcionValida && proyecto.tipo_inversion !== "mensual") {
      throw new Error(
        `❌ Inconsistencia: Se encontró una suscripción, pero el proyecto "${proyecto.nombre_proyecto}" no es de tipo 'mensual'.`,
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
          "❌ Ya existe un contrato firmado para esta inversión.",
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
          "❌ Ya existe un contrato firmado para esta suscripción.",
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
   * Valida si el usuario es elegible para firmar un contrato.
   * NO crea ningún registro, solo valida.
   * @param {object} data - Datos para validación
   * @returns {Promise<object>} Datos de inversión/suscripción válida
   * @throws {Error} Si falla cualquier validación
   */
  async validateContractEligibility(data) {
    const { id_usuario_firmante, id_proyecto, id_contrato_plantilla } = data;

    // Verificar que el usuario no sea admin
    const usuario =
      await require("./usuario.service").findById(id_usuario_firmante);
    if (usuario && usuario.rol === "admin") {
      throw new Error(
        "⛔ Los administradores no pueden firmar contratos como clientes.",
      );
    }

    // 1. Verificación KYC
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

    // 2. Validar proyecto
    const proyecto = await Proyecto.findByPk(id_proyecto);
    if (!proyecto) {
      throw new Error("❌ El proyecto especificado no existe.");
    }

    // 3. Validar plantilla
    const plantilla = await ContratoPlantilla.findByPk(id_contrato_plantilla);
    if (!plantilla) {
      throw new Error("❌ La plantilla de contrato especificada no existe.");
    }

    const idProyectoNum = parseInt(id_proyecto);
    if (plantilla.id_proyecto !== idProyectoNum) {
      throw new Error(
        `❌ Error de seguridad: La plantilla de contrato (ID: ${id_contrato_plantilla}) no pertenece al proyecto "${proyecto.nombre_proyecto}".`,
      );
    }

    if (!plantilla.activo) {
      throw new Error(
        "❌ La plantilla de contrato seleccionada está inactiva y no puede ser utilizada.",
      );
    }

    // 4. Auto-detección de inversión/suscripción
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

    // 5. Validaciones de coherencia
    if (!inversionValida && !suscripcionValida) {
      if (proyecto.tipo_inversion === "directo") {
        throw new Error(
          `❌ Debes completar el pago de tu inversión antes de firmar el contrato para el proyecto "${proyecto.nombre_proyecto}".`,
        );
      } else {
        throw new Error(
          `❌ Debes tener una suscripción activa con el pago inicial (Mes 1) completado para el proyecto "${proyecto.nombre_proyecto}".`,
        );
      }
    }

    if (inversionValida && suscripcionValida) {
      throw new Error(
        "❌ Error de integridad: Se encontró una inversión Y una suscripción. Contacta soporte.",
      );
    }

    if (inversionValida && proyecto.tipo_inversion !== "directo") {
      throw new Error(
        `❌ Inconsistencia: Se encontró una inversión, pero el proyecto "${proyecto.nombre_proyecto}" no es de tipo 'directo'.`,
      );
    }

    if (suscripcionValida && proyecto.tipo_inversion !== "mensual") {
      throw new Error(
        `❌ Inconsistencia: Se encontró una suscripción, pero el proyecto "${proyecto.nombre_proyecto}" no es de tipo 'mensual'.`,
      );
    }

    // 6. Verificar contrato duplicado
    if (inversionValida) {
      const contratoExistente = await ContratoFirmado.findOne({
        where: {
          id_inversion_asociada: inversionValida.id,
          estado_firma: "FIRMADO",
        },
      });

      if (contratoExistente) {
        throw new Error(
          "❌ Ya existe un contrato firmado para esta inversión.",
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
          "❌ Ya existe un contrato firmado para esta suscripción.",
        );
      }
    }

    // ✅ Si llegamos aquí, todo está OK
    return {
      inversionValida,
      suscripcionValida,
      proyecto,
    };
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
   * Útil para el frontend: saber si el usuario pagó y si ya firmó el contrato.
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
    // Para proyectos directos no hay ambigüedad: solo puede haber una inversión
    // pagada por usuario/proyecto (el proyecto se Finaliza al pagarse).

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
    // Una persona PUEDE tener múltiples suscripciones activas al mismo proyecto.
    // Lógica:
    //   1. Traer TODAS las suscripciones activas del usuario en el proyecto.
    //   2. Para cada una, verificar si tiene el primer pago confirmado.
    //   3. De las que tienen pago, buscar si alguna ya tiene contrato firmado.
    //   4. Si hay una sin firmar → puede_firmar: true (prioridad: la más reciente).
    //   5. Si todas están firmadas → puede_firmar: false.

    if (proyecto.tipo_inversion === "mensual") {
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

      // Construir detalle completo por cada suscripción
      const suscripcionesDetalle = [];

      for (const suscripcion of suscripciones) {
        const primerPago = await Pago.findOne({
          where: {
            id_suscripcion: suscripcion.id,
            mes: 1,
            estado_pago: "pagado",
          },
        });

        const tienePago = !!primerPago;

        let contratoFirmado = null;
        if (tienePago) {
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

        suscripcionesDetalle.push({
          suscripcion_id: suscripcion.id,
          tiene_pago: tienePago,
          tiene_contrato_firmado: !!contratoFirmado,
          puede_firmar: tienePago && !contratoFirmado,
          monto: primerPago ? primerPago.monto : null,
          fecha_pago: primerPago ? primerPago.createdAt : null,
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

      // ── Determinar el estado global para el frontend ──────────────────────────

      // Suscripción pendiente de firma: pagada pero sin contrato (la más reciente primero)
      const pendienteDeFirma = suscripcionesDetalle.find((s) => s.puede_firmar);

      // ¿Tiene al menos una firmada?
      const algunaFirmada = suscripcionesDetalle.some(
        (s) => s.tiene_contrato_firmado,
      );

      // ¿Tiene al menos un pago confirmado en alguna suscripción?
      const algunPago = suscripcionesDetalle.some((s) => s.tiene_pago);

      let mensaje;
      if (pendienteDeFirma) {
        mensaje = algunaFirmada
          ? `El usuario tiene ${suscripcionesDetalle.filter((s) => s.tiene_contrato_firmado).length} suscripción(es) firmada(s) y 1 suscripción con pago confirmado pendiente de firma.`
          : "El usuario tiene un pago confirmado pero aún no firmó el contrato.";
      } else if (algunaFirmada) {
        mensaje =
          "Todas las suscripciones con pago confirmado ya tienen contrato firmado.";
      } else {
        mensaje =
          "El usuario aún no tiene pagos confirmados en ninguna suscripción.";
      }

      return {
        tiene_pago: algunPago,
        tiene_contrato_firmado: algunaFirmada,
        // puede_firmar apunta a la suscripción más reciente sin firma (si existe)
        puede_firmar: !!pendienteDeFirma,
        // entidad_pagadora apunta a la que necesita firma (para que el front sepa a cuál dirigir)
        entidad_pagadora: pendienteDeFirma
          ? {
              tipo: "suscripcion",
              id: pendienteDeFirma.suscripcion_id,
              monto: pendienteDeFirma.monto,
              fecha: pendienteDeFirma.fecha_pago,
              estado: "pagado",
            }
          : null,
        // contrato_firmado apunta al más reciente firmado (para mostrar en el historial)
        contrato_firmado:
          suscripcionesDetalle.find((s) => s.contrato_firmado)
            ?.contrato_firmado || null,
        // detalle completo por si el front quiere mostrar el historial de suscripciones
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
