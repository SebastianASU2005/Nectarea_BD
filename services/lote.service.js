const Lote = require("../models/lote");
const Imagen = require("../models/imagen");
const Puja = require("../models/puja");
const { Op } = require("sequelize");
const mensajeService = require("./mensaje.service");
const usuarioService = require("./usuario.service");
const emailService = require("./email.service");
const { sequelize } = require("../config/database");
const Usuario = require("../models/usuario");

// NOTA: PujaService y Proyecto se requieren dinámicamente dentro de las funciones para evitar dependencias circulares.

/**
 * @typedef {object} LoteData
 * @property {number} [id_proyecto] - ID opcional del proyecto al que pertenece (Subasta privada).
 * @property {number} [latitud] - Coordenada de latitud.
 * @property {number} [longitud] - Coordenada de longitud.
 * @property {string} [estado_subasta] - Estado del lote (pendiente, activa, finalizada).
 * // ... otros campos del Lote
 */

// ============================================================
// INCLUDE REUTILIZABLE — puja más alta del lote
// Se incluye en todas las consultas que devuelven lotes para
// exponer el monto actual sin necesitar una segunda consulta.
// ============================================================
const PUJA_MAS_ALTA_INCLUDE = {
  model: Puja,
  as: "pujaMasAlta",
  attributes: ["id", "monto_puja", "id_usuario", "estado_puja", "fecha_puja"],
  required: false, // LEFT JOIN — si no hay puja, el lote igual aparece
};

// ============================================================
// INCLUDE REUTILIZABLE — ganador del lote
// ============================================================
const GANADOR_INCLUDE = {
  model: Usuario,
  as: "ganador",
  attributes: [
    "id",
    "nombre",
    "apellido",
    "email",
    "dni",
    "nombre_usuario",
    "numero_telefono",
  ],
  required: false,
};

// ============================================================
// INCLUDE REUTILIZABLE — imágenes del lote
// ============================================================
const IMAGENES_INCLUDE = {
  model: Imagen,
  as: "imagenes",
};

/**
 * Servicio de lógica de negocio para la gestión de Lotes y su ciclo de vida en la Subasta.
 * Contiene funciones para el CRUD básico y la compleja gestión de finalización, impago y reasignación de lotes.
 */
const loteService = {
  /**
   * @async
   * @function create
   * @description Crea un nuevo lote. Valida la existencia del proyecto asociado y la integridad de las coordenadas geográficas.
   * @param {LoteData} data - Datos del lote a crear (incluyendo posibles coordenadas).
   * @returns {Promise<Lote>} El lote creado.
   * @throws {Error} Si el `id_proyecto` no existe o si las coordenadas están incompletas.
   */
  async create(data) {
    const { id_proyecto, latitud, longitud } = data;

    if (id_proyecto) {
      const Proyecto = require("../models/proyecto");
      const proyecto = await Proyecto.findByPk(id_proyecto);

      if (!proyecto) {
        throw new Error(`El proyecto con ID ${id_proyecto} no fue encontrado.`);
      }
    }

    if ((latitud && !longitud) || (!latitud && longitud)) {
      throw new Error(
        "Si proporciona latitud, debe proporcionar longitud y viceversa.",
      );
    }

    if (latitud && longitud) {
      data.latitud = parseFloat(latitud);
      data.longitud = parseFloat(longitud);
    }

    return await Lote.create(data);
  },

  /**
   * @async
   * @function findAll
   * @description Busca todos los lotes, incluyendo imágenes, ganador y puja más alta actual.
   * @returns {Promise<Lote[]>}
   */
  async findAll() {
    return await Lote.findAll({
      include: [IMAGENES_INCLUDE, GANADOR_INCLUDE, PUJA_MAS_ALTA_INCLUDE],
    });
  },

  /**
   * @async
   * @function findAllActivo
   * @description Busca todos los lotes activos, incluyendo imágenes, ganador y puja más alta actual.
   * @returns {Promise<Lote[]>}
   */
  async findAllActivo() {
    return await Lote.findAll({
      where: { activo: true },
      include: [IMAGENES_INCLUDE, GANADOR_INCLUDE, PUJA_MAS_ALTA_INCLUDE],
    });
  },

  /**
   * @async
   * @function findById
   * @description Busca un lote por ID, incluyendo imágenes, ganador y puja más alta actual.
   * @param {number} id - ID del lote.
   * @returns {Promise<Lote|null>}
   */
  async findById(id) {
    return await Lote.findByPk(id, {
      include: [IMAGENES_INCLUDE, GANADOR_INCLUDE, PUJA_MAS_ALTA_INCLUDE],
    });
  },

  /**
   * @async
   * @function findByIdActivo
   * @description Busca un lote por ID solo si está activo, incluyendo imágenes, ganador y puja más alta actual.
   * @param {number} id - ID del lote.
   * @returns {Promise<Lote|null>}
   */
  async findByIdActivo(id) {
    return await Lote.findOne({
      where: {
        id: id,
        activo: true,
      },
      include: [IMAGENES_INCLUDE, GANADOR_INCLUDE, PUJA_MAS_ALTA_INCLUDE],
    });
  },

  /**
   * @async
   * @function update
   * @description Actualiza un lote. Dispara notificaciones si el estado de subasta cambia de 'pendiente' a 'activa'.
   * @param {number} id - ID del lote.
   * @param {LoteData} data - Datos a actualizar.
   * @returns {Promise<Lote|null>}
   */
  async update(id, data) {
    const lote = await Lote.findByPk(id);
    if (!lote) {
      return null;
    }

    const { latitud, longitud } = data;
    if ((latitud && !longitud) || (!latitud && longitud)) {
      throw new Error(
        "Si proporciona latitud, debe proporcionar longitud y viceversa.",
      );
    }

    if (latitud && longitud) {
      data.latitud = parseFloat(latitud);
      data.longitud = parseFloat(longitud);
    }

    const estadoOriginal = lote.estado_subasta;
    const loteActualizado = await lote.update(data);

    if (
      loteActualizado.estado_subasta === "activa" &&
      estadoOriginal !== "activa"
    ) {
      const esSubastaPrivada = !!loteActualizado.id_proyecto;
      const remitente_id = 1;
      let usuariosParaNotificar = [];

      if (esSubastaPrivada) {
        const suscripcionProyectoService = require("./suscripcion_proyecto.service");
        usuariosParaNotificar =
          await suscripcionProyectoService.findUsersByProjectId(
            loteActualizado.id_proyecto,
          );
      } else {
        usuariosParaNotificar = await usuarioService.findAllActivos();
      }

      if (usuariosParaNotificar.length > 0) {
        const tipoSubasta = esSubastaPrivada ? "PRIVADA" : "PÚBLICA";
        const asunto = `NUEVO LOTE EN SUBASTA (${tipoSubasta})`;
        let contenidoMsg = `¡Subasta activa! El lote **${loteActualizado.nombre_lote}** (ID ${loteActualizado.id}) está ahora en subasta.`;
        if (esSubastaPrivada) {
          contenidoMsg += ` **Esta subasta es EXCLUSIVA para los suscriptores del Proyecto ID ${loteActualizado.id_proyecto}.**`;
        } else {
          contenidoMsg += ` ¡Revisa los detalles!`;
        }

        for (const usuario of usuariosParaNotificar) {
          if (usuario.id !== remitente_id && usuario.email) {
            await mensajeService.crear({
              id_remitente: remitente_id,
              id_receptor: usuario.id,
              contenido: contenidoMsg,
              asunto: asunto,
            });

            try {
              await emailService.notificarInicioSubasta(
                usuario.email,
                loteActualizado,
                esSubastaPrivada,
              );
            } catch (error) {
              console.error(
                `Error al enviar email de inicio de subasta a ${usuario.email} (Lote ${loteActualizado.id}): ${error.message}`,
              );
            }
          }
        }
      }
    }

    return loteActualizado;
  },

  /**
   * @async
   * @function softDelete
   * @description Realiza una eliminación lógica (soft delete) al marcar el lote como inactivo.
   * @param {number} id - ID del lote.
   * @returns {Promise<Lote|null>}
   */
  async softDelete(id) {
    const lote = await Lote.findByPk(id);
    if (!lote) {
      return null;
    }
    lote.activo = false;
    return await lote.save();
  },

  /**
   * @async
   * @function endAuction
   * @description Proceso transaccional de finalización de subasta. Identifica la puja más alta,
   * marca el lote como 'finalizado', establece el plazo de pago (90 días) e inicia la notificación al ganador.
   * @param {number} id - ID del lote a finalizar.
   * @returns {Promise<Puja|null>} La puja ganadora o null si no hubo postores.
   */
  async endAuction(id) {
    const t = await sequelize.transaction();
    const PujaService = require("./puja.service");
    let pujaGanadora = null;
    let fechaVencimiento = null;

    try {
      const lote = await Lote.findByPk(id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!lote) throw new Error("Lote no encontrado.");
      if (lote.estado_subasta !== "activa")
        throw new Error("La subasta no está activa.");

      // ✅ findHighestBidForLote ya filtra estado_puja: "activa"
      pujaGanadora = await PujaService.findHighestBidForLote(id);

      await lote.update(
        { estado_subasta: "finalizada", fecha_fin: new Date() },
        { transaction: t },
      );

      if (pujaGanadora) {
        // ✅ Verificación defensiva: la puja encontrada debe estar activa
        if (pujaGanadora.estado_puja !== "activa") {
          throw new Error(
            `Estado inválido para puja ganadora: ${pujaGanadora.estado_puja}`,
          );
        }

        await lote.update(
          { id_ganador: pujaGanadora.id_usuario, intentos_fallidos_pago: 1 },
          { transaction: t },
        );

        fechaVencimiento = new Date();
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 90);

        await pujaGanadora.update(
          {
            estado_puja: "ganadora_pendiente",
            fecha_vencimiento_pago: fechaVencimiento,
          },
          { transaction: t },
        );
      } else {
        await this.prepararLoteParaReingreso(lote, t);
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }

    if (pujaGanadora) {
      try {
        const ganador = await usuarioService.findById(pujaGanadora.id_usuario);
        const fechaLimiteStr = fechaVencimiento.toLocaleDateString("es-ES");

        if (ganador) {
          await emailService.notificarGanadorPuja(
            ganador,
            id,
            fechaLimiteStr,
            false,
          );

          const contenidoMsg = `¡Felicidades! Has ganado el Lote #${id}. Tienes 90 días, hasta el ${fechaLimiteStr}, para completar el pago.`;
          await mensajeService.enviarMensajeSistema(ganador.id, contenidoMsg);
        }

        await PujaService.gestionarTokensAlFinalizar(id);
        return pujaGanadora;
      } catch (error) {
        console.error(
          `Error en notificaciones/gestión de tokens tras finalización del Lote ${id}:`,
          error.message,
        );
        return pujaGanadora;
      }
    }

    return null;
  },

  /**
   * @async
   * @function findLotesSinProyecto
   * @description Busca todos los lotes activos sin proyecto asociado.
   * @returns {Promise<Lote[]>}
   */
  async findLotesSinProyecto() {
    return await Lote.findAll({
      where: {
        id_proyecto: null,
        activo: true,
      },
      include: [IMAGENES_INCLUDE, GANADOR_INCLUDE, PUJA_MAS_ALTA_INCLUDE],
    });
  },

  /**
   * @async
   * @function findLotesByProyectoId
   * @description Busca todos los lotes activos de un proyecto específico.
   * @param {number} idProyecto - ID del proyecto.
   * @returns {Promise<Lote[]>}
   */
  async findLotesByProyectoId(idProyecto) {
    if (!idProyecto) {
      throw new Error("El ID del proyecto es requerido.");
    }
    const Proyecto = require("../models/proyecto");
    return await Lote.findAll({
      where: {
        id_proyecto: idProyecto,
        activo: true,
      },
      include: [
        IMAGENES_INCLUDE,
        {
          model: Proyecto,
          as: "proyectoLote",
          include: [{ model: Imagen, as: "imagenes" }],
        },
        GANADOR_INCLUDE,
        PUJA_MAS_ALTA_INCLUDE,
      ],
    });
  },

  /**
   * @async
   * @function asignarSiguientePuja
   * @description Asigna el lote a la siguiente puja más alta que no haya incumplido.
   * @param {Lote} lote - Instancia del modelo Lote.
   * @param {object} transaction - Transacción de Sequelize (requerida).
   * @returns {Promise<Puja|null>}
   */
  async asignarSiguientePuja(lote, transaction) {
    const PujaService = require("./puja.service");

    const siguientePuja = await PujaService.findNextHighestBid(
      lote.id,
      transaction,
    );

    if (siguientePuja) {
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + 90);

      await siguientePuja.update(
        {
          estado_puja: "ganadora_pendiente",
          fecha_vencimiento_pago: fechaVencimiento,
        },
        { transaction },
      );

      await lote.update(
        { id_ganador: siguientePuja.id_usuario },
        { transaction },
      );

      const nuevoGanador = await usuarioService.findById(
        siguientePuja.id_usuario,
      );
      const fechaLimiteStr = fechaVencimiento.toLocaleDateString("es-ES");

      if (nuevoGanador) {
        await emailService.notificarGanadorPuja(
          nuevoGanador,
          lote.id,
          fechaLimiteStr,
          true,
        );
        const contenidoMsg = `¡Felicidades! El Lote #${lote.id} te ha sido reasignado (eras el siguiente postor) debido al impago del anterior usuario. Tienes 90 días, hasta el ${fechaLimiteStr}, para completar el pago.`;
        await mensajeService.enviarMensajeSistema(
          nuevoGanador.id,
          contenidoMsg,
        );
      }
      return siguientePuja;
    }
    return null;
  },

  /**
   * @async
   * @function prepararLoteParaReingreso
   * @description Limpia el lote y sus pujas para que pueda reingresar a una subasta futura.
   * @param {Lote} lote - Instancia del modelo Lote.
   * @param {object} transaction - Transacción de Sequelize (requerida).
   */
  async prepararLoteParaReingreso(lote, transaction) {
    const PujaService = require("./puja.service");

    // ── 1. Buscar TODAS las pujas del lote que retienen token ──────────────
    // Incluye: activa, ganadora_pendiente y ganadora_incumplimiento
    // (los postores 1 y 2 que fallaron quedan en ganadora_incumplimiento)
    const pujasConTokenRetenido = await Puja.findAll({
      where: {
        id_lote: lote.id,
        estado_puja: {
          [Op.in]: ["activa", "ganadora_pendiente", "ganadora_incumplimiento"],
        },
      },
      attributes: [
        "id",
        "id_usuario",
        "id_suscripcion",
        "monto_puja",
        "estado_puja",
      ],
      transaction,
    });

    // ── 2. Devolver token a CADA postor retenido ───────────────────────────
    for (const puja of pujasConTokenRetenido) {
      await PujaService.devolverTokenPorImpago(
        puja.id_usuario,
        lote.id,
        transaction,
      );
    }

    // ── 3. Limpiar todas las pujas del lote ────────────────────────────────
    await PujaService.clearBidsByLoteId(lote.id, transaction);

    // ── 4. Resetear el lote a estado inicial ───────────────────────────────
    await lote.update(
      {
        estado_subasta: "pendiente",
        id_ganador: null,
        fecha_fin: null,
        intentos_fallidos_pago: 0,
        id_puja_mas_alta: null,
        monto_ganador_lote: null,
        excedente_visualizacion: 0,
      },
      { transaction },
    );

    await mensajeService.enviarMensajeSistema(
      1,
      `El lote ${lote.nombre_lote} (ID: ${lote.id}) ha agotado 3 intentos de pago o no tuvo más postores válidos y será reingresado en la próxima subasta anual.`,
    );
  },

  /**
   * @async
   * @function procesarImpagoLote
   * @description LÓGICA CENTRAL de manejo de impagos. Reasigna al siguiente postor válido
   * o limpia el lote si no hay más postores.
   * @param {number} loteId - ID del lote a procesar.
   * @param {object} transaccion - Transacción de Sequelize (opcional).
   */
  async procesarImpagoLote(loteId, transaccion = null) {
    const SERVICE_NAME = "LoteService.procesarImpagoLote";
    const t = transaccion || (await sequelize.transaction());
    const shouldCommit = !transaccion;

    try {
      console.log(
        `[${SERVICE_NAME}] 🔄 Procesando impago para Lote ID: ${loteId}`,
      );

      const lote = await Lote.findByPk(loteId, { transaction: t });
      if (!lote) throw new Error(`Lote ${loteId} no encontrado.`);

      const intentoActual = lote.intentos_fallidos_pago || 0;

      if (intentoActual >= 3) {
        console.log(
          `[${SERVICE_NAME}] ⚠️ Lote ${loteId} ya alcanzó 3 intentos. Limpiando para reingreso...`,
        );
        await this.prepararLoteParaReingreso(lote, t);
        if (shouldCommit) await t.commit();
        return {
          success: true,
          accion: "limpieza",
          message: "Lote limpiado y listo para reingreso a subasta.",
        };
      }

      // ── 1. Marcar la puja ganadora fallida como incumplimiento ────────────
      const pujaGanadoraFallida = await Puja.findOne({
        where: {
          id_lote: loteId,
          estado_puja: "ganadora_pendiente",
        },
        transaction: t,
      });

      if (pujaGanadoraFallida) {
        // ✅ FIX 1: asignar el string directamente, no un objeto Op.in
        await pujaGanadoraFallida.update(
          {
            estado_puja: "ganadora_incumplimiento",
            fecha_vencimiento_pago: null,
          },
          { transaction: t },
        );
        console.log(
          `[${SERVICE_NAME}] ✅ Puja ID ${pujaGanadoraFallida.id} marcada como 'ganadora_incumplimiento'.`,
        );

        const PujaService = require("./puja.service");
        await PujaService.devolverTokenPorImpago(
          pujaGanadoraFallida.id_usuario,
          loteId,
          t,
        );
        console.log(
          `[${SERVICE_NAME}] ✅ Token devuelto al usuario ${pujaGanadoraFallida.id_usuario}.`,
        );
      }

      // ── 2. Registrar intento fallido ──────────────────────────────────────
      await lote.update(
        { intentos_fallidos_pago: intentoActual + 1 },
        { transaction: t },
      );

      console.log(
        `[${SERVICE_NAME}] ⚠️ Intento fallido #${intentoActual + 1} registrado.`,
      );

      // ── 3. Buscar siguiente postor activo ─────────────────────────────────
      const siguientePuja = await Puja.findOne({
        where: {
          id_lote: loteId,
          estado_puja: "activa",
        },
        order: [["monto_puja", "DESC"]],
        include: [{ model: Usuario, as: "usuario" }],
        transaction: t,
      });

      if (siguientePuja) {
        console.log(
          `[${SERVICE_NAME}] ✅ Siguiente postor encontrado: Puja ID ${siguientePuja.id}`,
        );

        const nuevaFechaLimite = new Date();
        nuevaFechaLimite.setDate(nuevaFechaLimite.getDate() + 90);

        await siguientePuja.update(
          {
            estado_puja: "ganadora_pendiente",
            fecha_vencimiento_pago: nuevaFechaLimite,
          },
          { transaction: t },
        );

        await lote.update(
          {
            id_ganador: siguientePuja.id_usuario,
            id_puja_mas_alta: siguientePuja.id,
          },
          { transaction: t },
        );
        const PujaService = require("./puja.service");
        const pujasRestantesActivas = await Puja.findAll({
          where: {
            id_lote: loteId,
            estado_puja: "activa",
            id: { [Op.ne]: siguientePuja.id },
          },
          attributes: ["id_usuario"],
          transaction: t,
        });

        for (const p of pujasRestantesActivas) {
          await PujaService.devolverTokenPorImpago(p.id_usuario, loteId, t);
        }

        await emailService.notificarGanadorPuja(
          siguientePuja.usuario,
          loteId,
          nuevaFechaLimite.toLocaleDateString("es-ES"),
          true,
        );

        await mensajeService.enviarMensajeSistema(
          siguientePuja.id_usuario,
          `🎉 ¡Eres el Nuevo Ganador! Tu puja para el Lote #${loteId} ha sido reasignada como ganadora. Tienes 90 días para pagar (hasta ${nuevaFechaLimite.toLocaleDateString("es-ES")}).`,
        );

        console.log(
          `[${SERVICE_NAME}] ✅ Lote ${loteId} reasignado a usuario ${siguientePuja.id_usuario}.`,
        );

        if (shouldCommit) await t.commit();

        return {
          success: true,
          accion: "reasignacion",
          message: `Lote reasignado al siguiente postor (Puja ID: ${siguientePuja.id}).`,
          nuevoGanador: siguientePuja.id_usuario,
        };
      }

      // ── 4. No hay más postores — limpiar lote ─────────────────────────────
      console.log(
        `[${SERVICE_NAME}] ⚠️ No hay más postores válidos. Limpiando lote ${loteId}...`,
      );
      await this.prepararLoteParaReingreso(lote, t);

      if (shouldCommit) await t.commit();

      return {
        success: true,
        accion: "limpieza",
        message: "No hay más postores. Lote limpiado para reingreso a subasta.",
      };
    } catch (error) {
      if (shouldCommit) await t.rollback();
      console.error(`[${SERVICE_NAME}] ❌ ERROR:`, error.message);
      throw error;
    }
  },
  /**
   * @async
   * @function findLotesToStart
   * @description Busca lotes en estado 'pendiente' cuya fecha de inicio ya pasó. (Para cron job)
   * @returns {Promise<Lote[]>}
   */
  async findLotesToStart() {
    return Lote.findAll({
      where: {
        estado_subasta: "pendiente",
        fecha_inicio: {
          [Op.lte]: new Date(),
        },
        activo: true,
      },
    });
  },

  /**
   * @async
   * @function findLotesToEnd
   * @description Busca lotes en estado 'activa' cuya fecha de fin ya pasó. (Para cron job)
   * @returns {Promise<Lote[]>}
   */
  async findLotesToEnd() {
    return Lote.findAll({
      where: {
        estado_subasta: "activa",
        fecha_fin: {
          [Op.lte]: new Date(),
        },
        activo: true,
      },
    });
  },

  /**
   * @async
   * @function updateLotesProyecto
   * @description Asocia un conjunto de lotes a un proyecto específico.
   * @param {number[]} lotesIds - IDs de los lotes a actualizar.
   * @param {number} idProyecto - ID del proyecto.
   * @param {object} transaction - Transacción de Sequelize (requerida).
   */
  async updateLotesProyecto(lotesIds, idProyecto, transaction) {
    return Lote.update(
      { id_proyecto: idProyecto },
      {
        where: { id: { [Op.in]: lotesIds } },
        transaction,
      },
    );
  },
  /**
   * Busca todos los lotes que el usuario ganó y pagó.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<Lote[]>}
   */
  async findLotesGanadosByUserId(userId) {
    return await Lote.findAll({
      where: {
        id_ganador: userId,
        activo: true,
      },
      include: [
        IMAGENES_INCLUDE,
        GANADOR_INCLUDE,
        PUJA_MAS_ALTA_INCLUDE,
        {
          model: Puja,
          as: "pujas",
          where: {
            id_usuario: userId,
            estado_puja: "ganadora_pagada",
          },
          required: true, // INNER JOIN: solo lotes donde haya una puja pagada del usuario
          attributes: [
            "id",
            "monto_puja",
            "estado_puja",
            "fecha_puja",
            "fecha_vencimiento_pago",
          ],
        },
      ],
      order: [["id", "DESC"]],
    });
  },
};

module.exports = loteService;
