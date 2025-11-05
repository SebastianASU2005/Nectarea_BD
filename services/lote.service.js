const Lote = require("../models/lote");
const Imagen = require("../models/imagen");
const Puja = require("../models/puja"); // Importación del modelo Puja para operaciones internas
const { Op } = require("sequelize");
const mensajeService = require("./mensaje.service");
const usuarioService = require("./usuario.service");
const emailService = require("./email.service"); // Servicio para enviar notificaciones por correo
const { sequelize } = require("../config/database");

// NOTA: PujaService se requiere dinámicamente dentro de las funciones para evitar dependencias circulares.

/**
 * Servicio de lógica de negocio para la gestión de Lotes y su ciclo de vida en la Subasta.
 */
const loteService = {
  /**
   * @async
   * @function create
   * @description Crea un nuevo lote, validando opcionalmente si el proyecto asociado existe.
   * Ahora soporta campos de ubicación geográfica (latitud y longitud).
   * @param {object} data - Datos del lote a crear (puede incluir latitud y longitud).
   * @returns {Promise<Lote>} El lote creado.
   * @throws {Error} Si el `id_proyecto` especificado no existe o las coordenadas son inválidas.
   */
  async create(data) {
    const { id_proyecto, latitud, longitud } = data;

    if (id_proyecto) {
      // 1. Validar la existencia del Proyecto (se requiere el modelo localmente)
      const Proyecto = require("../models/proyecto");
      const proyecto = await Proyecto.findByPk(id_proyecto);

      if (!proyecto) {
        throw new Error(`El proyecto con ID ${id_proyecto} no fue encontrado.`);
      }
    }

    // 🆕 VALIDACIÓN OPCIONAL: Si se proporciona una coordenada, la otra también debe estar presente
    if ((latitud && !longitud) || (!latitud && longitud)) {
      throw new Error(
        "Si proporciona latitud, debe proporcionar longitud y viceversa."
      );
    }

    // 🆕 Convertir coordenadas a números si están presentes
    if (latitud && longitud) {
      data.latitud = parseFloat(latitud);
      data.longitud = parseFloat(longitud);
    }

    // 2. Crear el lote
    return await Lote.create(data);
  },
  /**
   * @async
   * @function findAll
   * @description Busca todos los lotes, incluyendo imágenes asociadas (uso administrativo).
   * @returns {Promise<Lote[]>} Lista de todos los lotes.
   */
  async findAll() {
    return await Lote.findAll({
      include: [{ model: Imagen, as: "imagenes" }],
    });
  },

  /**
   * @async
   * @function findAllActivo
   * @description Busca todos los lotes que están activos (no eliminados lógicamente).
   * @returns {Promise<Lote[]>} Lista de lotes activos.
   */
  async findAllActivo() {
    return await Lote.findAll({
      where: { activo: true },
      include: [{ model: Imagen, as: "imagenes" }],
    });
  },

  /**
   * @async
   * @function findById
   * @description Busca un lote por ID (uso administrativo, incluye inactivos).
   * @param {number} id - ID del lote.
   * @returns {Promise<Lote|null>} El lote o null.
   */
  async findById(id) {
    return await Lote.findByPk(id, {
      include: [{ model: Imagen, as: "imagenes" }],
    });
  },

  /**
   * @async
   * @function findByIdActivo
   * @description Busca un lote por ID, verificando que esté activo (para usuarios).
   * @param {number} id - ID del lote.
   * @returns {Promise<Lote|null>} El lote activo o null.
   */
  async findByIdActivo(id) {
    return await Lote.findOne({
      where: {
        id: id,
        activo: true,
      },
      include: [{ model: Imagen, as: "imagenes" }],
    });
  },

  /**
   * @async
   * @function update
   * @description Actualiza un lote. Si el estado cambia a 'activa', notifica a los usuarios relevantes.
   * Ahora soporta actualización de coordenadas geográficas.
   * @param {number} id - ID del lote.
   * @param {object} data - Datos a actualizar (puede incluir latitud y longitud).
   * @returns {Promise<Lote|null>} El lote actualizado o null.
   */
  async update(id, data) {
    const lote = await Lote.findByPk(id);
    if (!lote) {
      return null;
    }

    // 🆕 VALIDACIÓN: Si se actualiza una coordenada, ambas deben estar presentes
    const { latitud, longitud } = data;
    if ((latitud && !longitud) || (!latitud && longitud)) {
      throw new Error(
        "Si proporciona latitud, debe proporcionar longitud y viceversa."
      );
    }

    // 🆕 Convertir coordenadas a números si están presentes
    if (latitud && longitud) {
      data.latitud = parseFloat(latitud);
      data.longitud = parseFloat(longitud);
    }

    const estadoOriginal = lote.estado_subasta;
    const loteActualizado = await lote.update(data); // Lógica de notificación al activar la subasta

    if (
      loteActualizado.estado_subasta === "activa" &&
      estadoOriginal !== "activa"
    ) {
      // 1. Determinar si es una subasta privada (asociada a un proyecto)
      const esSubastaPrivada = !!loteActualizado.id_proyecto; // true si id_proyecto tiene valor
      const remitente_id = 1; // ID del sistema
      let usuariosParaNotificar = []; // 2. Obtener los usuarios a notificar

      if (esSubastaPrivada) {
        // Si es privada, solo se notifica a los suscriptores del proyecto (se requiere el servicio)
        const suscripcionService = require("./suscripcion.service"); // ASUMIMOS que existe una función para obtener suscriptores por ID de Proyecto
        usuariosParaNotificar = await suscripcionService.findUsersByProyectoId(
          loteActualizado.id_proyecto
        );
      } else {
        // Si es pública (sin id_proyecto), se notifica a todos los usuarios activos
        usuariosParaNotificar = await usuarioService.findAllActivos();
      } // 3. Procesar las notificaciones

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
            // A. Enviar Mensaje Interno (asunto y contenido según si es privada o pública)
            await mensajeService.crear({
              id_remitente: remitente_id,
              id_receptor: usuario.id,
              contenido: contenidoMsg,
              asunto: asunto,
            });

            // B. 🚀 Llamada a la función centralizada en email.service
            try {
              await emailService.notificarInicioSubasta(
                usuario.email,
                loteActualizado,
                esSubastaPrivada
              );
            } catch (error) {
              console.error(
                `Error al enviar email a ${usuario.email} para el lote ${loteActualizado.id}: ${error.message}`
              ); // Continuar el bucle a pesar del fallo de un correo
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
   * @description Realiza una eliminación lógica (soft delete) marcando el lote como inactivo.
   * @param {number} id - ID del lote.
   * @returns {Promise<Lote|null>} El lote actualizado o null.
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
   * @description Finaliza la subasta de un lote, asigna la puja ganadora potencial, establece el plazo de pago de 90 días,
   * y notifica al ganador.
   * @param {number} id - ID del lote.
   * @returns {Promise<Puja|null>} La puja ganadora o null si no hubo pujas.
   * @throws {Error} Si el lote no existe o la subasta no está activa.
   */
  async endAuction(id) {
    const t = await sequelize.transaction();
    const PujaService = require("./puja.service");
    let pujaGanadora = null;
    let fechaVencimiento = null;

    try {
      const lote = await Lote.findByPk(id, { transaction: t });
      if (!lote) throw new Error("Lote no encontrado.");
      if (lote.estado_subasta !== "activa")
        throw new Error("La subasta no está activa.");

      pujaGanadora = await PujaService.findHighestBidForLote(id);

      // 1. Finalizar el lote en DB
      await lote.update(
        {
          estado_subasta: "finalizada",
          fecha_fin: new Date(),
        },
        { transaction: t }
      );

      if (pujaGanadora) {
        // 2. Asignar el ganador potencial al lote e inicializar el intento de pago
        await lote.update(
          {
            id_ganador: pujaGanadora.id_usuario,
            intentos_fallidos_pago: 1, // Se cuenta como primer intento
          },
          { transaction: t }
        );

        // 3. Calcular la fecha de vencimiento (HOY + 90 DÍAS)
        fechaVencimiento = new Date();
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 90);

        // 4. Actualizar el estado de la puja ganadora con el plazo
        await pujaGanadora.update(
          {
            estado_puja: "ganadora_pendiente", // Estado de espera de pago
            fecha_vencimiento_pago: fechaVencimiento,
          },
          { transaction: t }
        );
      }

      await t.commit(); // ✅ COMMIT de la transacción de DB
    } catch (error) {
      await t.rollback(); // Revertir en caso de error de DB/lógica
      throw error;
    }

    // =========================================================
    // 🔔 LÓGICA DE NOTIFICACIONES Y TOKENS (NO TRANSACCIONAL)
    // =========================================================

    if (pujaGanadora) {
      try {
        const ganador = await usuarioService.findById(pujaGanadora.id_usuario);
        const fechaLimiteStr = fechaVencimiento.toLocaleDateString("es-ES");

        if (ganador) {
          // Notificación al ganador
          await emailService.notificarGanadorPuja(
            ganador,
            id,
            fechaLimiteStr,
            false // No es reasignación inicial
          );
          const contenidoMsg = `¡Felicidades! Has ganado el Lote #${id}. Tienes 90 días, hasta el ${fechaLimiteStr}, para completar el pago.`;
          await mensajeService.enviarMensajeSistema(ganador.id, contenidoMsg);
        }

        // 🔑 Gestión de tokens de los perdedores (libera todos excepto el Top 3)
        await PujaService.gestionarTokensAlFinalizar(id);
        return pujaGanadora;
      } catch (error) {
        // Si fallan las notificaciones, solo se registra el error (la DB ya hizo commit)
        console.error(
          `Error al enviar notificaciones o gestionar tokens tras la finalización del lote ${id}:`,
          error.message
        );
        return pujaGanadora;
      }
    }

    // Si no hubo puja ganadora (lote finalizado sin postores)
    return null;
  },
  /**
   * @async
   * @function findLotesSinProyecto
   * @description Busca todos los lotes que NO tienen asociado un proyecto (id_proyecto es NULL).
   * @returns {Promise<Lote[]>} Lista de lotes sin proyecto.
   */
  async findLotesSinProyecto() {
    return await Lote.findAll({
      where: {
        id_proyecto: null, // Buscar donde el campo id_proyecto es NULL
        activo: true, // Asumimos que solo nos interesan los lotes activos para la gestión
      },
      include: [{ model: Imagen, as: "imagenes" }],
    });
  },

  /**
   * @async
   * @function findLotesByProyectoId
   * @description Busca todos los lotes asociados a un ID de proyecto específico.
   * @param {number} idProyecto - ID del proyecto.
   * @returns {Promise<Lote[]>} Lista de lotes del proyecto.
   */
  async findLotesByProyectoId(idProyecto) {
    if (!idProyecto) {
      throw new Error("El ID del proyecto es requerido.");
    }
    return await Lote.findAll({
      where: {
        id_proyecto: idProyecto, // Buscar por el ID de proyecto
        activo: true, // Asumimos que solo nos interesan los lotes activos
      },
      include: [{ model: Imagen, as: "imagenes" }],
    });
  },

  /**
   * @async
   * @function asignarSiguientePuja
   * @description Busca la siguiente puja más alta que no haya incumplido y la asigna como ganadora_pendiente.
   * Notifica al nuevo ganador sobre la reasignación.
   * @param {Lote} lote - Instancia del modelo Lote.
   * @param {object} transaction - Transacción de Sequelize.
   * @returns {Promise<Puja|null>} La nueva puja asignada o null.
   */
  async asignarSiguientePuja(lote, transaction) {
    const PujaService = require("./puja.service");

    // 1. Busca la puja más alta que NO haya incumplido (ni pagado)
    const siguientePuja = await PujaService.findNextHighestBid(
      lote.id,
      transaction
    );

    if (siguientePuja) {
      // 2. Calcular la fecha de vencimiento (HOY + 90 DÍAS)
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + 90);

      // 3. Actualiza el estado y establece el nuevo plazo en la Puja
      await siguientePuja.update(
        {
          estado_puja: "ganadora_pendiente",
          fecha_vencimiento_pago: fechaVencimiento,
        },
        { transaction }
      );

      // 4. Asigna el nuevo ganador potencial al Lote
      await lote.update(
        { id_ganador: siguientePuja.id_usuario },
        { transaction }
      );

      // 5. Notificar al nuevo ganador (Reasignado)
      const nuevoGanador = await usuarioService.findById(
        siguientePuja.id_usuario
      );
      const fechaLimiteStr = fechaVencimiento.toLocaleDateString("es-ES");

      if (nuevoGanador) {
        // Email: Notificamos con el flag 'esReasignacion' en TRUE
        await emailService.notificarGanadorPuja(
          nuevoGanador,
          lote.id,
          fechaLimiteStr,
          true // TRUE para indicar que es por reasignación
        );
        // Mensajería Interna
        const contenidoMsg = `¡Felicidades! El Lote #${lote.id} te ha sido reasignado (eras el siguiente postor) debido al impago del anterior usuario. Tienes 90 días, hasta el ${fechaLimiteStr}, para completar el pago.`;
        await mensajeService.enviarMensajeSistema(
          nuevoGanador.id,
          contenidoMsg
        );
      }
      return siguientePuja;
    }
    return null;
  },

  /**
   * @async
   * @function prepararLoteParaReingreso
   * @description Limpia el lote y sus pujas (borra todas) para que pueda reingresar a una subasta futura.
   * Se llama después del tercer impago o si no quedan más postores válidos.
   * @param {Lote} lote - Instancia del modelo Lote.
   * @param {object} transaction - Transacción de Sequelize.
   */
  async prepararLoteParaReingreso(lote, transaction) {
    const PujaService = require("./puja.service");

    // 1. Liberar el token del último postor bloqueado (si existe)
    const ultimaPujaActiva = await Puja.findOne({
      where: {
        id_lote: lote.id,
        estado_puja: { [Op.in]: ["activa", "ganadora_pendiente"] },
      },
      order: [["monto_puja", "DESC"]],
      transaction,
    });

    if (ultimaPujaActiva) {
      // Devuelve el token al usuario (la función tiene protección de idempotencia)
      await PujaService.devolverTokenPorImpago(
        ultimaPujaActiva.id_usuario,
        lote.id,
        transaction
      );
    }

    // 2. LIMPIEZA CRÍTICA: Borrar TODAS las pujas asociadas al lote (prepara el lote para una nueva vida)
    await PujaService.clearBidsByLoteId(lote.id, transaction);

    // 3. Reiniciar el estado del Lote
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
    );

    // 4. Notificación al administrador
    await mensajeService.enviarMensajeSistema(
      1, // ID del administrador (Sistema)
      `El lote ${lote.nombre_lote} (ID: ${lote.id}) ha agotado 3 intentos de pago o no tuvo más postores válidos y será reingresado en la próxima subasta anual.`
    );
  },

  /**
   * @async
   * @function procesarImpagoLote
   * @description Maneja el proceso de impago cuando una puja 'ganadora_pendiente' ha vencido.
   * Marca la puja como incumplimiento, devuelve el token al usuario incumplidor, e intenta reasignar el lote
   * o lo prepara para reingreso si se agotan los 3 intentos.
   * @param {number} loteId - ID del lote afectado.
   * @throws {Error} Si el lote no es encontrado o falla la transacción.
   */
  async procesarImpagoLote(loteId) {
    const t = await sequelize.transaction();
    const PujaService = require("./puja.service");
    const usuarioService = require("./usuario.service");

    try {
      const lote = await Lote.findByPk(loteId, { transaction: t });
      if (!lote) throw new Error("Lote no encontrado.");

      // 1. Encontrar y marcar la puja incumplidora (la que tiene el plazo vencido)
      const pujaIncumplidora =
        await PujaService.findExpiredGanadoraPendienteByLote(loteId, t);

      if (pujaIncumplidora) {
        // A. Marcar como incumplimiento
        await pujaIncumplidora.update(
          { estado_puja: "ganadora_incumplimiento" },
          { transaction: t }
        );

        // B. Devolver el token al usuario incumplidor DENTRO de la transacción
        await PujaService.devolverTokenPorImpago(
          pujaIncumplidora.id_usuario,
          loteId,
          t
        );

        // C. Notificar el impago al usuario incumplidor
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
        }

        // 2. Incrementar el contador de fallos
        const nuevosIntentos = (lote.intentos_fallidos_pago || 0) + 1;

        if (nuevosIntentos <= 3) {
          // A. Si no se han agotado los 3 intentos, se actualiza el contador e intenta reasignar
          await lote.update(
            { intentos_fallidos_pago: nuevosIntentos },
            { transaction: t }
          );

          // B. Intento de reasignación al siguiente postor válido
          const siguientePuja = await this.asignarSiguientePuja(lote, t);

          if (!siguientePuja) {
            // C. Si no hay más pujas válidas, se limpia el lote para reingreso
            await this.prepararLoteParaReingreso(lote, t);
          }
        } else {
          // D. Más de 3 fallos: Limpieza final y reingreso
          await this.prepararLoteParaReingreso(lote, t);
        }
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
  /**
   * @async
   * @function findLotesToStart
   * @description Busca lotes en estado 'pendiente' cuya fecha de inicio ya haya pasado.
   * @returns {Promise<Lote[]>} Lista de lotes listos para iniciar subasta.
   */
  async findLotesToStart() {
    return Lote.findAll({
      where: {
        estado_subasta: "pendiente",
        fecha_inicio: {
          [Op.lte]: new Date(), // Fecha de inicio menor o igual a la hora actual
        },
        activo: true,
      },
    });
  },
  /**
   * @async
   * @function findLotesToEnd
   * @description Busca lotes en estado 'activa' cuya fecha de fin ya haya pasado.
   * @returns {Promise<Lote[]>} Lista de lotes listos para finalizar subasta.
   */
  async findLotesToEnd() {
    return Lote.findAll({
      where: {
        estado_subasta: "activa",
        fecha_fin: {
          [Op.lte]: new Date(), // Fecha de fin menor o igual a la hora actual
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
   * @param {number} idProyecto - ID del proyecto al que se asociarán.
   * @param {object} transaction - Transacción de Sequelize.
   * @returns {Promise<[number]>} Resultado de la operación de actualización.
   */
  async updateLotesProyecto(lotesIds, idProyecto, transaction) {
    return Lote.update(
      { id_proyecto: idProyecto },
      {
        where: { id: { [Op.in]: lotesIds } },
        transaction,
      }
    );
  },
};

module.exports = loteService;
