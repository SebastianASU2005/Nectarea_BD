const Lote = require("../models/lote");
const Imagen = require("../models/imagen");
const Puja = require("../models/puja"); // Importación del modelo Puja para operaciones internas (relaciones)
const { Op } = require("sequelize");
const mensajeService = require("./mensaje.service");
const usuarioService = require("./usuario.service");
const emailService = require("./email.service"); // Servicio para enviar notificaciones por correo
const { sequelize } = require("../config/database");

// NOTA: PujaService y Proyecto se requieren dinámicamente dentro de las funciones para evitar dependencias circulares.

/**
 * @typedef {object} LoteData
 * @property {number} [id_proyecto] - ID opcional del proyecto al que pertenece (Subasta privada).
 * @property {number} [latitud] - Coordenada de latitud.
 * @property {number} [longitud] - Coordenada de longitud.
 * @property {string} [estado_subasta] - Estado del lote (pendiente, activa, finalizada).
 * // ... otros campos del Lote
 */

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
      // 1. Validación: Requiere el modelo de Proyecto localmente.
      const Proyecto = require("../models/proyecto");
      const proyecto = await Proyecto.findByPk(id_proyecto);

      if (!proyecto) {
        throw new Error(`El proyecto con ID ${id_proyecto} no fue encontrado.`);
      }
    } // 2. Validación de Coordenadas: Si se proporciona una, se requiere la otra.

    if ((latitud && !longitud) || (!latitud && longitud)) {
      throw new Error(
        "Si proporciona latitud, debe proporcionar longitud y viceversa."
      );
    } // 3. Conversión de tipo: Asegurar que las coordenadas sean de tipo numérico.

    if (latitud && longitud) {
      data.latitud = parseFloat(latitud);
      data.longitud = parseFloat(longitud);
    } // 4. Crear el lote.

    return await Lote.create(data);
  }
  /**
   * @async
   * @function findAll
   * @description Busca todos los lotes, incluyendo sus imágenes asociadas.
   * @returns {Promise<Lote[]>} Lista de todos los lotes (incluye inactivos para administración).
   */,

  async findAll() {
    return await Lote.findAll({
      include: [{ model: Imagen, as: "imagenes" }],
    });
  }
  /**
   * @async
   * @function findAllActivo
   * @description Busca todos los lotes que están activos (`activo: true`).
   * @returns {Promise<Lote[]>} Lista de lotes activos, incluyendo sus imágenes.
   */,

  async findAllActivo() {
    return await Lote.findAll({
      where: { activo: true },
      include: [{ model: Imagen, as: "imagenes" }],
    });
  }
  /**
   * @async
   * @function findById
   * @description Busca un lote por ID, incluyendo imágenes.
   * @param {number} id - ID del lote.
   * @returns {Promise<Lote|null>} El lote o `null`.
   */,

  async findById(id) {
    return await Lote.findByPk(id, {
      include: [{ model: Imagen, as: "imagenes" }],
    });
  }
  /**
   * @async
   * @function findByIdActivo
   * @description Busca un lote por ID, solo si está activo.
   * @param {number} id - ID del lote.
   * @returns {Promise<Lote|null>} El lote activo o `null`.
   */,

  async findByIdActivo(id) {
    return await Lote.findOne({
      where: {
        id: id,
        activo: true,
      },
      include: [{ model: Imagen, as: "imagenes" }],
    });
  }
  /**
   * @async
   * @function update
   * @description Actualiza un lote. Dispara notificaciones si el estado de subasta cambia de 'pendiente' a 'activa'.
   * @param {number} id - ID del lote.
   * @param {LoteData} data - Datos a actualizar.
   * @returns {Promise<Lote|null>} El lote actualizado o `null`.
   */,

  async update(id, data) {
    const lote = await Lote.findByPk(id);
    if (!lote) {
      return null;
    } // 1. Validación de Coordenadas: Asegurar consistencia si se actualizan.

    const { latitud, longitud } = data;
    if ((latitud && !longitud) || (!latitud && longitud)) {
      throw new Error(
        "Si proporciona latitud, debe proporcionar longitud y viceversa."
      );
    } // Conversión de tipo.
    if (latitud && longitud) {
      data.latitud = parseFloat(latitud);
      data.longitud = parseFloat(longitud);
    }

    const estadoOriginal = lote.estado_subasta;
    const loteActualizado = await lote.update(data); // 2. Lógica de Notificación: Si el estado cambia a 'activa'.

    if (
      loteActualizado.estado_subasta === "activa" &&
      estadoOriginal !== "activa"
    ) {
      // 2.1 Determinar si es una subasta privada (asociada a un proyecto).
      const esSubastaPrivada = !!loteActualizado.id_proyecto;
      const remitente_id = 1; // ID del sistema
      let usuariosParaNotificar = []; // 2.2 Obtener los usuarios relevantes.

      if (esSubastaPrivada) {
        // Privada: Solo suscriptores del proyecto.
        const suscripcionService = require("./suscripcion.service");
        usuariosParaNotificar = await suscripcionService.findUsersByProyectoId(
          loteActualizado.id_proyecto
        );
      } else {
        // Pública: Todos los usuarios activos.
        usuariosParaNotificar = await usuarioService.findAllActivos();
      } // 2.3 Procesar y enviar las notificaciones.

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
            // Notificación A: Mensaje Interno
            await mensajeService.crear({
              id_remitente: remitente_id,
              id_receptor: usuario.id,
              contenido: contenidoMsg,
              asunto: asunto,
            }); // Notificación B: Email
            try {
              await emailService.notificarInicioSubasta(
                usuario.email,
                loteActualizado,
                esSubastaPrivada
              );
            } catch (error) {
              console.error(
                `Error al enviar email de inicio de subasta a ${usuario.email} (Lote ${loteActualizado.id}): ${error.message}`
              );
            }
          }
        }
      }
    }

    return loteActualizado;
  }
  /**
   * @async
   * @function softDelete
   * @description Realiza una eliminación lógica (soft delete) al marcar el lote como inactivo (`activo = false`).
   * @param {number} id - ID del lote.
   * @returns {Promise<Lote|null>} El lote actualizado (inactivo) o `null`.
   */,

  async softDelete(id) {
    const lote = await Lote.findByPk(id);
    if (!lote) {
      return null;
    }
    lote.activo = false;
    return await lote.save();
  }
  /**
   * @async
   * @function endAuction
   * @description Proceso transaccional de **finalización de subasta**. Identifica la puja más alta,
   * marca el lote como 'finalizado', establece el plazo de pago (90 días) e inicia la notificación al ganador.
   * @param {number} id - ID del lote a finalizar.
   * @returns {Promise<Puja|null>} La puja ganadora o `null` si no hubo postores.
   * @throws {Error} Si el lote no existe, no está activo o falla la transacción.
   */,

  async endAuction(id) {
    const t = await sequelize.transaction();
    const PujaService = require("./puja.service"); // Dependencia dinámica
    let pujaGanadora = null;
    let fechaVencimiento = null;

    try {
      const lote = await Lote.findByPk(id, { transaction: t });
      if (!lote) throw new Error("Lote no encontrado.");
      if (lote.estado_subasta !== "activa")
        throw new Error("La subasta no está activa."); // 1. Encontrar la puja más alta.

      pujaGanadora = await PujaService.findHighestBidForLote(id); // 2. Finalizar el lote en DB.

      await lote.update(
        {
          estado_subasta: "finalizada",
          fecha_fin: new Date(),
        },
        { transaction: t }
      );

      if (pujaGanadora) {
        // 3. Asignar el ganador potencial al lote e inicializar el contador de intentos de pago.
        await lote.update(
          {
            id_ganador: pujaGanadora.id_usuario,
            intentos_fallidos_pago: 1, // Primer intento asignado al ganador
          },
          { transaction: t }
        ); // 4. Calcular y establecer la fecha de vencimiento (90 días).

        fechaVencimiento = new Date();
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 90); // 5. Marcar la puja ganadora con el estado y plazo de pago.

        await pujaGanadora.update(
          {
            estado_puja: "ganadora_pendiente",
            fecha_vencimiento_pago: fechaVencimiento,
          },
          { transaction: t }
        );
      }

      await t.commit(); // Fin de la transacción.
    } catch (error) {
      await t.rollback();
      throw error;
    } // ------------------------------------------------------------------- // 🔔 LÓGICA ASÍNCRONA DE NOTIFICACIONES Y LIBERACIÓN DE TOKENS (FUERA DE TRANSACCIÓN) // -------------------------------------------------------------------

    if (pujaGanadora) {
      try {
        const ganador = await usuarioService.findById(pujaGanadora.id_usuario);
        const fechaLimiteStr = fechaVencimiento.toLocaleDateString("es-ES");

        if (ganador) {
          // Notificación al ganador por Email.
          await emailService.notificarGanadorPuja(
            ganador,
            id,
            fechaLimiteStr,
            false // Indica que no es reasignación.
          ); // Mensaje Interno al ganador.
          const contenidoMsg = `¡Felicidades! Has ganado el Lote #${id}. Tienes 90 días, hasta el ${fechaLimiteStr}, para completar el pago.`;
          await mensajeService.enviarMensajeSistema(ganador.id, contenidoMsg);
        } // Gestión de tokens: Libera los tokens de los postores perdedores (excepto el Top 3, según la lógica interna).

        await PujaService.gestionarTokensAlFinalizar(id);
        return pujaGanadora;
      } catch (error) {
        // Se registra el error de notificación/token, pero se retorna el resultado de la DB ya confirmado.
        console.error(
          `Error en notificaciones/gestión de tokens tras finalización del Lote ${id}:`,
          error.message
        );
        return pujaGanadora;
      }
    } // Retorna null si el lote finalizó sin pujas.

    return null;
  }
  /**
   * @async
   * @function findLotesSinProyecto
   * @description Busca todos los lotes activos que NO están asociados a un proyecto (`id_proyecto` es NULL).
   * @returns {Promise<Lote[]>} Lista de lotes disponibles para subasta pública o para ser asignados a un proyecto.
   */,

  async findLotesSinProyecto() {
    return await Lote.findAll({
      where: {
        id_proyecto: null,
        activo: true,
      },
      include: [{ model: Imagen, as: "imagenes" }],
    });
  }
  /**
   * @async
   * @function findLotesByProyectoId
   * @description Busca todos los lotes activos asociados a un ID de proyecto específico.
   * @param {number} idProyecto - ID del proyecto.
   * @returns {Promise<Lote[]>} Lista de lotes del proyecto.
   * @throws {Error} Si el ID del proyecto es nulo o indefinido.
   */,

  async findLotesByProyectoId(idProyecto) {
    if (!idProyecto) {
      throw new Error("El ID del proyecto es requerido.");
    }
    return await Lote.findAll({
      where: {
        id_proyecto: idProyecto,
        activo: true,
      },
      include: [{ model: Imagen, as: "imagenes" }],
    });
  }
  /**
   * @async
   * @function asignarSiguientePuja
   * @description Asigna el lote a la siguiente puja más alta que no haya incumplido.
   * Es el paso clave en la reasignación por impago.
   * @param {Lote} lote - Instancia del modelo Lote (debe ser la instancia en la transacción).
   * @param {object} transaction - Transacción de Sequelize (requerida).
   * @returns {Promise<Puja|null>} La nueva puja ganadora asignada o `null` si no hay más postores válidos.
   */,

  async asignarSiguientePuja(lote, transaction) {
    const PujaService = require("./puja.service"); // 1. Buscar la puja más alta que NO esté en estado 'ganadora_incumplimiento' o 'pagado'.

    const siguientePuja = await PujaService.findNextHighestBid(
      lote.id,
      transaction
    );

    if (siguientePuja) {
      // 2. Calcular el nuevo plazo de 90 días.
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + 90); // 3. Actualizar la puja con el nuevo estado y plazo.

      await siguientePuja.update(
        {
          estado_puja: "ganadora_pendiente",
          fecha_vencimiento_pago: fechaVencimiento,
        },
        { transaction }
      ); // 4. Asignar el nuevo ganador al Lote.

      await lote.update(
        { id_ganador: siguientePuja.id_usuario },
        { transaction }
      ); // 5. Notificación al nuevo ganador (Lógica asíncrona fuera de la transacción si es posible). // NOTA: Aquí el código original hace la notificación dentro de la función transaccional, pero el envío de email es inherentemente asíncrono e idealmente no transaccional.

      const nuevoGanador = await usuarioService.findById(
        siguientePuja.id_usuario
      );
      const fechaLimiteStr = fechaVencimiento.toLocaleDateString("es-ES");

      if (nuevoGanador) {
        await emailService.notificarGanadorPuja(
          nuevoGanador,
          lote.id,
          fechaLimiteStr,
          true // TRUE: Indica que es una reasignación.
        );
        const contenidoMsg = `¡Felicidades! El Lote #${lote.id} te ha sido reasignado (eras el siguiente postor) debido al impago del anterior usuario. Tienes 90 días, hasta el ${fechaLimiteStr}, para completar el pago.`;
        await mensajeService.enviarMensajeSistema(
          nuevoGanador.id,
          contenidoMsg
        );
      }
      return siguientePuja;
    }
    return null;
  }
  /**
   * @async
   * @function prepararLoteParaReingreso
   * @description Limpia el lote y sus pujas (borra todas) para que pueda reingresar a una subasta futura.
   * Se llama cuando se agotan los postores válidos o se cumplen los 3 intentos de pago fallidos.
   * @param {Lote} lote - Instancia del modelo Lote (debe ser la instancia en la transacción).
   * @param {object} transaction - Transacción de Sequelize (requerida).
   */,

  async prepararLoteParaReingreso(lote, transaction) {
    const PujaService = require("./puja.service"); // 1. Liberar el token del último postor que quedó activo/pendiente (si existe).

    const ultimaPujaActiva = await Puja.findOne({
      where: {
        id_lote: lote.id,
        estado_puja: { [Op.in]: ["activa", "ganadora_pendiente"] },
      },
      order: [["monto_puja", "DESC"]],
      transaction,
    });

    if (ultimaPujaActiva) {
      // Devuelve el token (la función de PujaService debe manejar la lógica de negocio).
      await PujaService.devolverTokenPorImpago(
        ultimaPujaActiva.id_usuario,
        lote.id,
        transaction
      );
    } // 2. LIMPIEZA CRÍTICA: Borrar TODAS las pujas asociadas al lote (es un borrado físico de los registros de puja).

    await PujaService.clearBidsByLoteId(lote.id, transaction); // 3. Reiniciar los campos del Lote a su estado inicial.

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
      { transaction }
    ); // 4. Notificación al administrador sobre la acción realizada.

    await mensajeService.enviarMensajeSistema(
      1, // ID del administrador/sistema
      `El lote ${lote.nombre_lote} (ID: ${lote.id}) ha agotado 3 intentos de pago o no tuvo más postores válidos y será reingresado en la próxima subasta anual.`
    );
  }
  /**
   * @async
   * @function procesarImpagoLote
   * @description Maneja el proceso de impago de una puja 'ganadora_pendiente' con plazo vencido.
   * Se encarga de marcar el incumplimiento, devolver el token, incrementar el contador de fallos
   * y decidir si reasignar al siguiente postor o preparar el lote para reingreso.
   * @param {number} loteId - ID del lote afectado.
   * @throws {Error} Si el lote no es encontrado o falla la transacción.
   */,

  async procesarImpagoLote(loteId) {
    const t = await sequelize.transaction();
    const PujaService = require("./puja.service");

    try {
      const lote = await Lote.findByPk(loteId, { transaction: t });
      if (!lote) throw new Error("Lote no encontrado."); // 1. Encontrar y marcar la puja incumplidora.

      const pujaIncumplidora =
        await PujaService.findExpiredGanadoraPendienteByLote(loteId, t);

      if (pujaIncumplidora) {
        // A. Marcar la puja como incumplimiento.
        await pujaIncumplidora.update(
          { estado_puja: "ganadora_incumplimiento" },
          { transaction: t }
        ); // B. Devolver el token (debe ocurrir dentro de la transacción).

        await PujaService.devolverTokenPorImpago(
          pujaIncumplidora.id_usuario,
          loteId,
          t
        ); // C. Notificar el impago al usuario incumplidor.

        const usuarioIncumplidor = await usuarioService.findById(
          pujaIncumplidora.id_usuario
        );

        if (usuarioIncumplidor) {
          await emailService.notificarImpago(usuarioIncumplidor, loteId);
          const contenidoMsg = `ATENCIÓN: Has perdido el Lote #${loteId} por incumplimiento de pago. El plazo de 90 días ha expirado. Tu token ha sido devuelto a tu cuenta.`;
          await mensajeService.enviarMensajeSistema(
            usuarioIncumplidor.id,
            contenidoMsg
          );
        } // 2. Lógica de reasignación / reingreso

        const nuevosIntentos = (lote.intentos_fallidos_pago || 0) + 1;

        if (nuevosIntentos <= 3) {
          // A. Actualizar contador e intentar reasignar.
          await lote.update(
            { intentos_fallidos_pago: nuevosIntentos },
            { transaction: t }
          );

          const siguientePuja = await this.asignarSiguientePuja(lote, t);

          if (!siguientePuja) {
            // B. No hay postores válidos restantes: Preparar para reingreso.
            await this.prepararLoteParaReingreso(lote, t);
          }
        } else {
          // C. Se agotaron los 3 intentos: Limpieza final y reingreso.
          await this.prepararLoteParaReingreso(lote, t);
        }
      }

      await t.commit(); // Confirmar la transacción.
    } catch (error) {
      await t.rollback(); // Revertir en caso de error.
      throw error;
    }
  }
  /**
   * @async
   * @function findLotesToStart
   * @description Busca lotes en estado 'pendiente' cuya fecha de inicio ya haya pasado.
   * Función utilizada por un job de cron para automatizar el inicio de subastas.
   * @returns {Promise<Lote[]>} Lista de lotes listos para iniciar subasta.
   */,

  async findLotesToStart() {
    return Lote.findAll({
      where: {
        estado_subasta: "pendiente",
        fecha_inicio: {
          [Op.lte]: new Date(), // Menor o igual a la hora actual.
        },
        activo: true,
      },
    });
  }
  /**
   * @async
   * @function findLotesToEnd
   * @description Busca lotes en estado 'activa' cuya fecha de fin ya haya pasado.
   * Función utilizada por un job de cron para automatizar el cierre de subastas.
   * @returns {Promise<Lote[]>} Lista de lotes listos para finalizar subasta.
   */,

  async findLotesToEnd() {
    return Lote.findAll({
      where: {
        estado_subasta: "activa",
        fecha_fin: {
          [Op.lte]: new Date(), // Menor o igual a la hora actual.
        },
        activo: true,
      },
    });
  }
  /**
   * @async
   * @function updateLotesProyecto
   * @description Asocia un conjunto de lotes a un proyecto específico.
   * @param {number[]} lotesIds - IDs de los lotes a actualizar.
   * @param {number} idProyecto - ID del proyecto al que se asociarán.
   * @param {object} transaction - Transacción de Sequelize (requerida).
   * @returns {Promise<[number]>} Resultado de la operación de actualización (número de filas afectadas).
   */,

  async updateLotesProyecto(lotesIds, idProyecto, transaction) {
    return Lote.update(
      { id_proyecto: idProyecto },
      {
        where: { id: { [Op.in]: lotesIds } }, // Actualizar solo los IDs en el array.
        transaction,
      }
    );
  },
};

module.exports = loteService;
