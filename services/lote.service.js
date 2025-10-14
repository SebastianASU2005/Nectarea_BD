const Lote = require("../models/lote");
const Imagen = require("../models/imagen");
const Puja = require("../models/puja"); // Modelo Puja necesario para la fecha de vencimiento
const { Op } = require("sequelize");
const mensajeService = require("./mensaje.service");
const usuarioService = require("./usuario.service");
const emailService = require("./email.service"); // 🚨 NUEVA IMPORTACIÓN
const { sequelize } = require("../config/database");

// NOTA: PujaService se requiere dinámicamente dentro de las funciones para evitar dependencias circulares.

const loteService = {
  // Crea un nuevo lote y valida que el proyecto exista
  async create(data) {
    const { id_proyecto } = data;

    if (id_proyecto) {
      // 1. Si el ID del proyecto está presente, validamos que el proyecto exista.
      const Proyecto = require("../models/proyecto");
      const proyecto = await Proyecto.findByPk(id_proyecto);

      if (!proyecto) {
        throw new Error(`El proyecto con ID ${id_proyecto} no fue encontrado.`);
      }
    } // 2. Crear el lote (con o sin id_proyecto inicial)

    return await Lote.create(data);
  }, // Busca todos los lotes (para administradores)
  async findAll() {
    return await Lote.findAll({
      include: [{ model: Imagen, as: "imagenes" }],
    });
  }, // Busca todos los lotes que no estén eliminados (para usuarios)
  async findAllActivo() {
    return await Lote.findAll({
      where: { activo: true },
      include: [{ model: Imagen, as: "imagenes" }],
    });
  }, // Busca un lote por ID (para administradores)
  async findById(id) {
    return await Lote.findByPk(id, {
      include: [{ model: Imagen, as: "imagenes" }],
    });
  }, // Busca un lote por ID, verificando que no esté eliminado (para usuarios)
  async findByIdActivo(id) {
    return await Lote.findOne({
      where: {
        id: id,
        activo: true,
      },
      include: [{ model: Imagen, as: "imagenes" }],
    });
  }, // Actualiza un lote por ID
  async update(id, data) {
    const lote = await Lote.findByPk(id);
    if (!lote) {
      return null;
    }

    const estadoOriginal = lote.estado_subasta;
    const loteActualizado = await lote.update(data); // El mensaje se enviará si el nuevo estado es 'activa' Y el estado original NO era 'activa'
    if (
      loteActualizado.estado_subasta === "activa" &&
      estadoOriginal !== "activa"
    ) {
      const todosLosUsuarios = await usuarioService.findAllActivos();
      const remitente_id = 1;

      if (todosLosUsuarios.length > 1) {
        const contenido = `¡Subasta activa! El lote con ID ${loteActualizado.id} está ahora en subasta. ¡Revisa los detalles!`;
        for (const usuario of todosLosUsuarios) {
          if (usuario.id !== remitente_id) {
            await mensajeService.crear({
              id_remitente: remitente_id,
              id_receptor: usuario.id,
              contenido: contenido,
            });
          }
        }
      }
    }

    return loteActualizado;
  }, // Elimina lógicamente un lote
  async softDelete(id) {
    const lote = await Lote.findByPk(id);
    if (!lote) {
      return null;
    }
    lote.activo = false;
    return await lote.save();
  }
  /**
   * Finaliza la subasta, asigna al ganador potencial y establece el plazo de pago de 90 días.
   * @param {number} id - ID del lote.
   */,
  async endAuction(id) {
    const t = await sequelize.transaction();
    const PujaService = require("./puja.service");
    let pujaGanadora = null; // Declarada aquí para ser accesible después del try/catch
    let fechaVencimiento = null; // Declarada aquí para ser accesible después del try/catch

    try {
      const lote = await Lote.findByPk(id, { transaction: t });
      if (!lote) throw new Error("Lote no encontrado.");
      if (lote.estado_subasta !== "activa")
        throw new Error("La subasta no está activa.");

      pujaGanadora = await PujaService.findHighestBidForLote(id); // Asignación aquí // Actualiza el lote a "finalizado"

      await lote.update(
        {
          estado_subasta: "finalizada",
          fecha_fin: new Date(),
        },
        { transaction: t }
      );

      if (pujaGanadora) {
        // **Paso 1:** Asigna el ganador potencial en el lote y establece el primer intento
        await lote.update(
          {
            id_ganador: pujaGanadora.id_usuario,
            intentos_fallidos_pago: 1, // Primer intento de pago
          },
          { transaction: t }
        ); // Calculamos la fecha de vencimiento: HOY + 90 DÍAS
        fechaVencimiento = new Date(); // Asignación aquí
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 90); // **Paso 2:** Actualiza el estado de la puja e incluye la fecha de vencimiento

        await pujaGanadora.update(
          {
            estado_puja: "ganadora_pendiente",
            fecha_vencimiento_pago: fechaVencimiento, // Plazo de 90 días
          },
          { transaction: t }
        );
      }

      await t.commit(); // 🚨 La transacción de DB termina aquí. // Cualquier error después de este punto no debe hacer rollback.
    } catch (error) {
      await t.rollback(); // Solo se ejecuta si hubo un error de DB/lógica *antes* del commit
      throw error;
    } // ========================================================= // 🔔 LÓGICA DE NOTIFICACIONES Y TOKENS (FUERA DEL TRY/CATCH DE DB) // =========================================================

    if (pujaGanadora) {
      try {
        // Se ejecuta la lógica de negocio no transaccional (notificaciones, tokens)
        const ganador = await usuarioService.findById(pujaGanadora.id_usuario);
        const fechaLimiteStr = fechaVencimiento.toLocaleDateString("es-ES");

        if (ganador) {
          // Notificación por Email (esReasignacion = false por defecto)
          await emailService.notificarGanadorPuja(
            ganador,
            id, // Usamos el ID del lote
            fechaLimiteStr,
            false // 🚨 No es reasignación inicial
          ); // Notificación por Mensajería Interna
          const contenidoMsg = `¡Felicidades! Has ganado el Lote #${id}. Tienes 90 días, hasta el ${fechaLimiteStr}, para completar el pago.`;
          await mensajeService.enviarMensajeSistema(ganador.id, contenidoMsg);
        } // 🔑 LLAMADA CLAVE: Gestionar tokens de los perdedores.

        // La lógica interna de esta función ahora libera a todos EXCEPTO al Top 3.
        await PujaService.gestionarTokensAlFinalizar(id);
        return pujaGanadora;
      } catch (error) {
        // Si las notificaciones fallan, *no* revertimos el estado de la DB.
        console.error(
          `Error al enviar notificaciones o gestionar tokens tras la finalización del lote ${id}:`,
          error.message
        ); // Decidimos retornar la puja para que el endpoint no falle, pero registramos el error.
        return pujaGanadora;
      }
    } // Si no hubo puja ganadora, solo se finalizó la subasta.

    return null;
  }
  /**
   * Busca la mejor puja siguiente que no haya incumplido y la asigna como ganadora_pendiente.
   * @param {object} lote - Instancia del modelo Lote.
   * @param {object} transaction - Transacción de Sequelize.
   * @returns {Puja|null} La nueva puja asignada.
   */,
  async asignarSiguientePuja(lote, transaction) {
    const PujaService = require("./puja.service"); // Busca la puja más alta que NO esté en estado 'ganadora_incumplimiento' o 'ganadora_pagada'
    const siguientePuja = await PujaService.findNextHighestBid(
      lote.id,
      transaction
    );

    if (siguientePuja) {
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + 90); // 🚨 Se asignan los 90 días // Actualiza el estado y establece el nuevo plazo

      await siguientePuja.update(
        {
          estado_puja: "ganadora_pendiente",
          fecha_vencimiento_pago: fechaVencimiento,
        },
        { transaction }
      ); // Asigna el nuevo ganador potencial al lote
      await lote.update(
        { id_ganador: siguientePuja.id_usuario },
        { transaction }
      ); // 🚨 NUEVA LÓGICA: Notificar al nuevo ganador (Reasignado)

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
          true // 🚨 TRUE para indicar que es por reasignación
        ); // Mensajería Interna (usando la nueva función del sistema)

        const contenidoMsg = `¡Felicidades! El Lote #${lote.id} te ha sido reasignado (eras el siguiente postor) debido al impago del anterior usuario. Tienes 90 días, hasta el ${fechaLimiteStr}, para completar el pago.`;
        await mensajeService.enviarMensajeSistema(
          nuevoGanador.id,
          contenidoMsg
        );
      } // FIN NUEVA LÓGICA
      return siguientePuja;
    }
    return null;
  }
  /**
   * Limpia el lote y sus pujas para que pueda reingresar a una subasta futura.
   * Se llama después de 3 intentos fallidos de pago O si no hay más postores válidos.
   * @param {object} lote - Instancia del modelo Lote.
   * @param {object} transaction - Transacción de Sequelize.
   */,
  async prepararLoteParaReingreso(lote, transaction) {
    const PujaService = require("./puja.service");

    // 🚨 MODIFICACIÓN CLAVE: Liberar el token del último postor bloqueado (si existe) 🚨
    // Si el lote llega aquí, puede que la última puja 'ganadora_pendiente' o 'activa'
    // esté bloqueando el último token (el de la persona que no pudo pagar o que era el siguiente).

    // 1. Encontrar la última puja válida que consumió el token
    const ultimaPujaActiva = await Puja.findOne({
      where: {
        id_lote: lote.id,
        estado_puja: { [Op.in]: ["activa", "ganadora_pendiente"] }, // Buscamos la que está bloqueando
      },
      order: [["monto_puja", "DESC"]], // La más alta es la que está bloqueada
      transaction,
    });

    if (ultimaPujaActiva) {
      // Usamos la función de devolver token, que ya tiene la protección de idempotencia (solo incrementa si está en 0)
      await PujaService.devolverTokenPorImpago(
        ultimaPujaActiva.id_usuario,
        lote.id,
        transaction
      );
    } // **2. LIMPIEZA CRÍTICA: Borrar todas las pujas asociadas al lote.**

    await PujaService.clearBidsByLoteId(lote.id, transaction); // **3. Reiniciar el estado del Lote.**

    await lote.update(
      {
        estado_subasta: "pendiente",
        id_ganador: null,
        fecha_fin: null,
        intentos_fallidos_pago: 0,
        id_puja_mas_alta: null, // Asegurar que también se limpie
        monto_ganador_lote: null,
        excedente_visualizacion: 0,
      },
      { transaction }
    ); // Notificación al administrador sobre el reingreso.

    await mensajeService.enviarMensajeSistema(
      1, // ID del administrador (Sistema)
      `El lote ${lote.nombre_lote} (ID: ${lote.id}) ha agotado 3 intentos de pago o no tuvo más postores válidos y será reingresado en la próxima subasta anual.`
    );
  }
  /**
   * Maneja el impago cuando una puja 'ganadora_pendiente' ha vencido.
   * Esta función debe ser llamada por el Scheduler (Cron Job).
   * @param {number} loteId - ID del lote afectado.
   */,
  async procesarImpagoLote(loteId) {
    const t = await sequelize.transaction();
    const PujaService = require("./puja.service"); // Se requieren los servicios para notificación
    const usuarioService = require("./usuario.service");

    try {
      const lote = await Lote.findByPk(loteId, { transaction: t });
      if (!lote) throw new Error("Lote no encontrado."); // 1. Encontrar y marcar la puja incumplidora (la que tiene el plazo vencido)

      const pujaIncumplidora =
        await PujaService.findExpiredGanadoraPendienteByLote(loteId, t);

      if (pujaIncumplidora) {
        // Marcar el estado
        await pujaIncumplidora.update(
          { estado_puja: "ganadora_incumplimiento" },
          { transaction: t }
        ); // 🚨 MODIFICACIÓN CLAVE: Devolver el token al usuario incumplidor DENTRO de la transacción

        // Esta función ahora tiene la protección para NO dar tokens duplicados.
        await PujaService.devolverTokenPorImpago(
          pujaIncumplidora.id_usuario,
          loteId,
          t
        ); // 🚨 Obtener usuario y notificar el impago 🚨

        const usuarioIncumplidor = await usuarioService.findById(
          pujaIncumplidora.id_usuario
        );

        if (usuarioIncumplidor) {
          // Notificación por Email (la nueva versión menciona la devolución del token)
          await emailService.notificarImpago(usuarioIncumplidor, loteId); // Notificación por Mensajería Interna

          const contenidoMsg = `ATENCIÓN: Has perdido el Lote #${loteId} por incumplimiento de pago. El plazo de 90 días ha expirado. Tu token ha sido devuelto a tu cuenta.`;
          await mensajeService.enviarMensajeSistema(
            usuarioIncumplidor.id,
            contenidoMsg
          );
        } // Sancionar al usuario incumplidor (Aquí iría la lógica de sanción si aplica) // await usuarioService.aplicarSancionPorImpago(pujaIncumplidora.id_usuario); // 2. Incrementar el contador de fallos

        const nuevosIntentos = (lote.intentos_fallidos_pago || 0) + 1;

        if (nuevosIntentos <= 3) {
          // Si estamos en el intento 1, 2 o 3 (que es un fallo), actualizamos el contador e intentamos reasignar
          await lote.update(
            { intentos_fallidos_pago: nuevosIntentos },
            { transaction: t }
          ); // 🚨 Intento de reasignación (llama a asignarSiguientePuja con notificaciones)

          const siguientePuja = await this.asignarSiguientePuja(lote, t);

          if (!siguientePuja) {
            // Si no hay más pujas válidas, se limpia el lote inmediatamente
            await this.prepararLoteParaReingreso(lote, t);
          }
        } else {
          // Más de 3 fallos: Ejecutar limpieza final
          await this.prepararLoteParaReingreso(lote, t);
        }
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }, // Asocia un conjunto de lotes a un proyecto
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
