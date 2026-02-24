// Archivo: services/proyecto.service.js (CORRECCIÓN FINAL)

const Proyecto = require("../models/proyecto");
const Lote = require("../models/lote");
const Imagen = require("../models/imagen");
const Inversion = require("../models/inversion");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
// 🚨 NUEVA IMPORTACIÓN DEL MODELO Usuario para romper la dependencia en las notificaciones
const Usuario = require("../models/usuario");

const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const emailService = require("./email.service");
const config = require("../config/config");
// Se mantienen las importaciones de servicios, aunque el uso se ha reducido/movido
const suscripcionProyectoService = require("./suscripcion_proyecto.service");
const mensajeService = require("./mensaje.service");
// ⚠️ Mantenemos la importación de usuarioService ya que 'findAllAdmins' puede ser necesaria.
const usuarioService = require("./usuario.service");

/**
 * Servicio de lógica de negocio para la gestión de Proyectos.
 */
const proyectoService = {
  /**
   * @async
   * @function crearProyecto
   * @description Crea un nuevo proyecto, aplica reglas de negocio y asocia lotes iniciales (si se proporcionan).
   * Ahora soporta campos de ubicación geográfica (latitud y longitud).
   * @param {object} projectData - Datos del proyecto a crear (puede incluir latitud y longitud).
   * @param {number[]} lotesIds - IDs de los lotes a asociar inicialmente.
   * @returns {Promise<Proyecto>} El proyecto recién creado.
   * @throws {Error} Si faltan campos obligatorios, el tipo de inversión es inválido o los lotes ya están asignados a otro proyecto.
   */
  async crearProyecto(projectData, lotesIds) {
    const {
      tipo_inversion,
      obj_suscripciones,
      monto_inversion,
      latitud,
      longitud,
      ...rest
    } = projectData;

    if (!tipo_inversion) {
      throw new Error("El tipo de inversión es obligatorio.");
    }

    // 🆕 VALIDACIÓN OPCIONAL: Si se proporciona una coordenada, la otra también debe estar presente
    if ((latitud && !longitud) || (!latitud && longitud)) {
      throw new Error(
        "Si proporciona latitud, debe proporcionar longitud y viceversa.",
      );
    }

    let dataFinal = { ...rest, tipo_inversion };

    // 🆕 Agregar coordenadas si están presentes
    if (latitud && longitud) {
      dataFinal.latitud = parseFloat(latitud);
      dataFinal.longitud = parseFloat(longitud);
    }

    switch (tipo_inversion) {
      case "directo":
        dataFinal.obj_suscripciones = 0;
        dataFinal.moneda = "USD";
        dataFinal.pack_de_lotes = true;

        if (!monto_inversion || Number(monto_inversion) <= 0) {
          throw new Error(
            "El monto de inversión debe ser definido para proyectos 'directo'.",
          );
        }
        dataFinal.monto_inversion = Number(monto_inversion).toFixed(2);
        break;

      case "mensual":
        dataFinal.moneda = "ARS";
        dataFinal.pack_de_lotes = false;

        const finalObjSuscripciones = Number(obj_suscripciones || 0);
        if (finalObjSuscripciones <= 0) {
          throw new Error(
            "El objetivo de suscripciones debe ser mayor a cero para proyectos 'mensual'.",
          );
        }
        dataFinal.obj_suscripciones = finalObjSuscripciones;

        if (!monto_inversion || Number(monto_inversion) <= 0) {
          throw new Error(
            "El monto base mensual debe ser definido para proyectos 'mensual'.",
          );
        }
        dataFinal.monto_inversion = Number(monto_inversion).toFixed(2);

        if (!dataFinal.plazo_inversion || dataFinal.plazo_inversion <= 0) {
          throw new Error(
            "El plazo de inversión (meses de duración) es obligatorio para proyectos 'mensual'.",
          );
        }
        break;

      default:
        throw new Error(
          "Tipo de inversión no válido. Use 'directo' o 'mensual'.",
        );
    }

    dataFinal.suscripciones_actuales = dataFinal.suscripciones_actuales || 0;
    dataFinal.estado_proyecto = dataFinal.estado_proyecto || "En Espera";
    dataFinal.activo = dataFinal.activo !== undefined ? dataFinal.activo : true;

    // Validación de unicidad de lotes
    if (lotesIds && lotesIds.length > 0) {
      const lotesAsignados = await Lote.findAll({
        where: {
          id: lotesIds,
          id_proyecto: { [Op.ne]: null },
        },
      });

      if (lotesAsignados.length > 0) {
        const idsConflictivos = lotesAsignados
          .map((lote) => lote.id)
          .join(", ");
        throw new Error(
          `❌ Los lotes con ID(s) ${idsConflictivos} ya están asociados a otro proyecto y no pueden ser reutilizados.`,
        );
      }
    }

    let nuevoProyecto;
    try {
      nuevoProyecto = await Proyecto.create(dataFinal);

      if (lotesIds && lotesIds.length > 0) {
        const lotes = await Lote.findAll({ where: { id: lotesIds } });
        await nuevoProyecto.addLotes(lotes);
      }

      return nuevoProyecto;
    } catch (error) {
      console.error("Error al crear el proyecto o asociar lotes:", error);
      throw error;
    }
  }, // ------------------------------------------------------------------- // FUNCIONES DE CONSULTA Y BÚSQUEDA // -------------------------------------------------------------------
  /**
   * @async
   * @function findAll
   * @description Obtiene todos los proyectos, incluyendo sus lotes e imágenes (para administradores).
   * @returns {Promise<Proyecto[]>} Lista de proyectos.
   */ async findAll() {
    return await Proyecto.findAll({
      include: [
        {
          model: Lote,
          as: "lotes",
          include: [{ model: Imagen, as: "imagenes" }],
        },
        { model: Imagen, as: "imagenes" },
      ],
    });
  },
  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todos los proyectos activos, incluyendo sus lotes e imágenes (para usuarios).
   * @returns {Promise<Proyecto[]>} Lista de proyectos activos.
   */ async findAllActivo() {
    return await Proyecto.findAll({
      where: { activo: true },
      include: [
        {
          model: Lote,
          as: "lotes",
          include: [{ model: Imagen, as: "imagenes" }],
        },
        { model: Imagen, as: "imagenes" },
      ],
    });
  },
  /**
   * @async
   * @function findById
   * @description Obtiene un proyecto por su ID, incluyendo lotes e imágenes (para administradores).
   * @param {number} id - ID del proyecto.
   * @returns {Promise<Proyecto|null>} El proyecto.
   */ async findById(id) {
    return await Proyecto.findByPk(id, {
      include: [
        {
          model: Lote,
          as: "lotes",
          include: [{ model: Imagen, as: "imagenes" }], 
        },
        { model: Imagen, as: "imagenes" },
      ],
    });
  },
  /**
   * @async
   * @function findByIdActivo
   * @description Obtiene un proyecto por su ID, verificando que esté activo (para usuarios).
   * @param {number} id - ID del proyecto.
   * @returns {Promise<Proyecto|null>} El proyecto activo.
   */ async findByIdActivo(id) {
    return await Proyecto.findOne({
      where: { id: id, activo: true },
      include: [
       {
          model: Lote,
          as: "lotes",
          include: [{ model: Imagen, as: "imagenes" }], 
        },
        { model: Imagen, as: "imagenes" },
      ],
    });
  },
  /**
   * @async
   * @function findByUserId
   * @description Busca proyectos activos en los que un usuario ha realizado una inversión pagada.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<Proyecto[]>} Lista de proyectos activos asociados a las inversiones pagadas del usuario.
   */ async findByUserId(userId) {
    return await Proyecto.findAll({
      where: { activo: true }, // Proyectos activos
      include: [
        {
          model: Inversion, // Une la tabla Inversion y filtra por usuario e inversiones pagadas.
          where: { id_usuario: userId, estado: "pagado" },
          required: true, // INNER JOIN: Solo proyectos con inversiones pagadas del usuario
        },
        {
          model: Lote,
          as: "lotes",
          include: [{ model: Imagen, as: "imagenes" }], 
        },
        { model: Imagen, as: "imagenes" },
      ],
    });
  }, // ------------------------------------------------------------------- // FUNCIONES CRUD DE MODIFICACIÓN // -------------------------------------------------------------------
  /**
   * @async
   * @function update
   * @description Actualiza los datos de un proyecto. (Solo para campos directos, no para relaciones como Lotes).
   * @param {number} id - ID del proyecto a actualizar.
   * @param {object} data - Datos a actualizar.
   * @param {object} [transaction] - Objeto de transacción de Sequelize opcional.
   * @returns {Promise<Proyecto|null>} El proyecto actualizado.
   */ async update(id, data, transaction) {
    const proyecto = await Proyecto.findByPk(id, { transaction });
    if (!proyecto) {
      return null;
    } // Actualiza el proyecto, usando la transacción si se proporciona.
    return await proyecto.update(data, { transaction });
  },
  /**
   * @async
   * @function softDelete
   * @description Realiza un borrado lógico (soft delete) del proyecto, marcándolo como inactivo.
   * @param {number} id - ID del proyecto a eliminar.
   * @returns {Promise<Proyecto|null>} El proyecto actualizado (inactivo).
   */ async softDelete(id) {
    const proyecto = await Proyecto.findByPk(id);
    if (!proyecto) {
      return null;
    }
    proyecto.activo = false;
    return await proyecto.save();
  }, // ------------------------------------------------------------------- // 🆕 FUNCIÓN CRÍTICA DE ASIGNACIÓN DE LOTES (POST-CREACIÓN) // -------------------------------------------------------------------
  /**
   * @async
   * @function asignarLotesAProyecto
   * @description Asocia un conjunto de lotes a un proyecto existente.
   * Esta operación es transaccional y valida que los lotes no estén ya asociados a otro proyecto.
   * @param {number} proyectoId - ID del proyecto.
   * @param {number[]} lotesIds - IDs de los lotes a asociar.
   * @returns {Promise<Proyecto>} El proyecto actualizado.
   * @throws {Error} Si el proyecto no existe o los lotes ya están asignados a otro proyecto.
   */ async asignarLotesAProyecto(proyectoId, lotesIds) {
    if (!lotesIds || lotesIds.length === 0) return;

    const t = await sequelize.transaction(); // 🌟 INICIO DE LA TRANSACCIÓN

    try {
      const proyecto = await Proyecto.findByPk(proyectoId, { transaction: t });
      if (!proyecto) {
        throw new Error(`Proyecto con ID ${proyectoId} no encontrado.`);
      } // 1. VALIDACIÓN DE UNICIDAD (DENTRO DE LA TRANSACCIÓN)

      const lotesConflictivos = await Lote.findAll({
        where: {
          id: lotesIds, // Busca lotes que ya tienen id_proyecto ASIGNADO y es diferente al actual
          id_proyecto: { [Op.ne]: null, [Op.ne]: proyectoId },
        },
        transaction: t,
      });

      if (lotesConflictivos.length > 0) {
        const idsConflictivos = lotesConflictivos
          .map((lote) => lote.id)
          .join(", ");
        throw new Error(
          `❌ Los lotes ${idsConflictivos} ya están asociados a otro proyecto y no pueden ser reasignados.`,
        );
      } // 2. Ejecutar la Asociación (addLotes internamente hace el update en la tabla Lote)

      const lotes = await Lote.findAll({
        where: { id: lotesIds },
        transaction: t,
      });
      await proyecto.addLotes(lotes, { transaction: t });

      await t.commit(); // ✅ COMMIT: Lotes asignados de forma segura
      return proyecto;
    } catch (error) {
      await t.rollback(); // ❌ ROLLBACK: Revierte cualquier cambio de lotes si falla
      throw error;
    }
  },
  /**
   * @async
   * @function revertirPorBajoUmbral
   * @description Revierte un proyecto de 'En proceso' a 'En Espera' (o 'Pausado')
   * si las suscripciones_actuales caen por debajo de suscripciones_minimas.
   * También notifica a los suscriptores y administradores por mensaje interno y email.
   * @param {Proyecto} proyecto - Instancia del proyecto de Sequelize.
   * @param {object} t - Transacción de Sequelize activa.
   * @returns {Promise<Proyecto>} El proyecto revertido.
   * @throws {Error} Si el proyecto no cumple las condiciones para revertir.
   */ async revertirPorBajoUmbral(proyecto, t) {
    if (proyecto.tipo_inversion !== "mensual") {
      throw new Error("El proyecto no es mensual.");
    }

    await proyecto.reload({ transaction: t }); // Recargar la instancia para obtener los valores más frescos.

    const proyectoRevertido = await proyecto.update(
      {
        estado_proyecto: "En Espera", // Vuelve a su estado inicial
        fecha_inicio_proceso: null, // Resetea la fecha de inicio
        objetivo_notificado: false, // Permite notificar el inicio de nuevo
      },
      { transaction: t },
    );

    // 2. Notificación a los suscriptores (Mensaje interno Y Email)
    // ✅ Solución al error de 'suscripcionProyectoService.findActiveByProjectId is not a function'
    const suscripcionesActivas = await SuscripcionProyecto.findAll({
      where: {
        id_proyecto: proyecto.id,
        activo: true,
      },
      transaction: t,
    });

    const remitente_id = 1; // ID del sistema

    const contenidoMensajeInterno = `🚨 ¡Importante! El proyecto "${proyecto.nombre_proyecto}" ha sido PAUSADO temporalmente
             debido a que el número de suscripciones activas (${proyecto.suscripciones_actuales}) ha caído por debajo
             del mínimo requerido (${proyecto.suscripciones_minimas}). Dejaremos de generar pagos mensuales
             hasta que se alcance nuevamente el objetivo de ${proyecto.obj_suscripciones} suscriptores.`;

    for (const suscripcion of suscripcionesActivas) {
      if (!suscripcion.id_usuario) {
        console.warn(
          `Suscripción ID ${suscripcion.id} no tiene id_usuario y fue ignorada para la notificación.`,
        );
        continue;
      } // A. Notificación por Mensaje Interno (Dentro de la transacción)

      await mensajeService.crear(
        {
          id_remitente: remitente_id,
          id_receptor: suscripcion.id_usuario,
          contenido: contenidoMensajeInterno,
        },
        { transaction: t },
      ); // B. Notificación por Email (Fuera de la transacción de DB)

      try {
        // 🛑 CORRECCIÓN: Usar el Modelo Usuario directamente para evitar el error de 'usuarioService.findByPk is not a function'
        const usuario = await Usuario.findByPk(suscripcion.id_usuario);
        if (usuario && usuario.email) {
          await emailService.notificarPausaProyecto(usuario, proyecto);
        } else {
          console.warn(
            `No se pudo enviar email: Usuario ID ${suscripcion.id_usuario} no encontrado o sin email.`,
          );
        }
      } catch (error) {
        console.error(
          `Error al enviar el email de pausa al usuario ${suscripcion.id_usuario}:`,
          error.message,
        );
      }
    } // 🟢 3. Notificación a los ADMINISTRADORES (Mensaje interno Y Email) // 🛑 SELECCIÓN DE DESTINATARIO: Solo se notifica a los administradores

    // Se mantiene la llamada a usuarioService.findAllAdmins() ya que es una función más compleja
    // que podría no estar fácilmente disponible en el Modelo.
    const admins = await usuarioService.findAllAdmins();
    const contenidoAdmin = `🛑 ALERTA DE REVERSIÓN: El proyecto "${proyecto.nombre_proyecto}" (ID: ${proyecto.id}) ha sido revertido de 'En proceso' a 'En Espera'. Suscripciones activas (${proyecto.suscripciones_actuales}) cayeron por debajo del mínimo (${proyecto.suscripciones_minimas}). Se han pausado los pagos.`;

    for (const admin of admins) {
      // Mensaje interno para el admin (Dentro de la transacción)
      await mensajeService.crear(
        {
          id_remitente: remitente_id,
          id_receptor: admin.id,
          contenido: contenidoAdmin,
        },
        { transaction: t },
      ); // Email a Admins (Uso de la función específica)

      if (admin.email) {
        try {
          await emailService.notificarReversionAdmin(admin.email, proyecto);
        } catch (e) {
          console.error(
            `Error al enviar email de reversión al admin ${admin.id}: ${e.message}`,
          );
        }
      }
    } // 🟢 FIN ADICIÓN
    return proyectoRevertido;
  }, // ------------------------------------------------------------------- // FUNCIONES DE CONTEO Y FINALIZACIÓN MENSUAL // -------------------------------------------------------------------
  /**
   * @async
   * @function iniciarConteoMensual
   * @description Pone el proyecto en estado 'En proceso', establece la fecha de inicio del conteo
   * y carga el plazo de inversión en meses restantes. Se asume que se llama al alcanzar el objetivo.
   * @param {number} proyectoId - ID del proyecto.
   * @returns {Promise<Proyecto>} El proyecto actualizado.
   * @throws {Error} Si el proyecto no existe, no es mensual o ya está en proceso.
   */ async iniciarConteoMensual(proyectoId) {
    const proyecto = await Proyecto.findByPk(proyectoId);

    if (!proyecto) {
      throw new Error("Proyecto no encontrado.");
    }
    if (proyecto.tipo_inversion !== "mensual") {
      throw new Error(
        "El proyecto no es de tipo 'mensual' y no requiere conteo.",
      );
    }
    if (proyecto.estado_proyecto !== "En Espera") {
      throw new Error("El proyecto ya ha iniciado o ha finalizado el proceso.");
    }
    if (!proyecto.plazo_inversion || proyecto.plazo_inversion <= 0) {
      throw new Error(
        "El proyecto mensual no tiene un 'plazo_inversion' definido.",
      );
    } // Actualiza el proyecto

    return await proyecto.update({
      estado_proyecto: "En proceso",
      fecha_inicio_proceso: new Date(), // Hoy // ⚠️ Se inicializa SOLO si no estaba ya pausado
      meses_restantes: proyecto.meses_restantes || proyecto.plazo_inversion,
      objetivo_notificado: true,
    });
  },
  /**
   * @async
   * @function findAllActivoMensual
   * @description Obtiene todos los proyectos activos con tipo de inversión 'mensual' (Ahorristas).
   * @returns {Promise<Proyecto[]>} Lista de proyectos activos mensuales.
   */
  async findAllActivoMensual() {
    return await Proyecto.findAll({
      where: {
        activo: true,
        tipo_inversion: "mensual", // Filtrar por Ahorristas
      },
      include: [
        {
          model: Lote,
          as: "lotes",
          include: [{ model: Imagen, as: "imagenes" }], 
        },
        { model: Imagen, as: "imagenes" },
      ],
    });
  },
  /**
   * @async
   * @function findAllActivoDirecto
   * @description Obtiene todos los proyectos activos con tipo de inversión 'directo' (Inversionistas).
   * @returns {Promise<Proyecto[]>} Lista de proyectos activos directos.
   */
  async findAllActivoDirecto() {
    return await Proyecto.findAll({
      where: {
        activo: true,
        tipo_inversion: "directo", // Filtrar por Inversionistas
      },
      include: [
        {
          model: Lote,
          as: "lotes",
          include: [{ model: Imagen, as: "imagenes" }], 
        },
        { model: Imagen, as: "imagenes" },
      ],
    });
  },
  /**
   * @async
   * @function finalizarMes
   * @description Decrementa el contador de meses_restantes para proyectos 'En proceso'
   * y notifica a los administradores si un proyecto llega a 0 meses restantes.
   * Esta función debe ser llamada por un Cron Job mensual.
   * @returns {Promise<Proyecto[]>} Los proyectos que han terminado su plazo.
   */ async finalizarMes() {
    const proyectosTerminados = [];
    const remitente_id = 1; // ID del sistema // 1. Buscar proyectos en proceso con meses_restantes > 0

    const proyectosActivos = await Proyecto.findAll({
      where: {
        estado_proyecto: "En proceso",
        tipo_inversion: "mensual",
        meses_restantes: { [Op.gt]: 0 },
      },
    });

    for (const proyecto of proyectosActivos) {
      // 2. Decrementar el contador
      // Usamos una transacción simple para el decremento y la recarga
      const t = await sequelize.transaction();
      try {
        await proyecto.decrement("meses_restantes", { by: 1, transaction: t });
        await proyecto.reload({ transaction: t }); // Recargar la instancia para obtener el valor actualizado // 3. Verificar si el proyecto ha terminado su plazo

        if (proyecto.meses_restantes <= 0) {
          proyectosTerminados.push(proyecto); // 4. Notificar a los administradores // 🛑 SELECCIÓN DE DESTINATARIO: Solo se notifica a los administradores

          const admins = await usuarioService.findAllAdmins();
          const contenidoAdmin = `✅ ¡Alerta de Finalización de Plazo! El plazo total de ${proyecto.plazo_inversion} meses para el proyecto "${proyecto.nombre_proyecto}" ha terminado. Por favor, revisa si quedan suscripciones activas con meses a pagar, si hay lotes pendientes de subastar o si el proyecto debe ser marcado como 'Finalizado'.`;

          for (const admin of admins) {
            // Mensaje interno (Dentro de la transacción)
            await mensajeService.crear(
              {
                id_remitente: remitente_id,
                id_receptor: admin.id,
                contenido: contenidoAdmin,
              },
              { transaction: t },
            ); // 🟢 ADICIÓN: Email a Admins (Fuera de la transacción de DB)

            if (admin.email) {
              try {
                await emailService.notificarFinalizacionAdmin(
                  admin.email,
                  proyecto,
                );
              } catch (e) {
                console.error(
                  `Error al enviar email de finalización al admin ${admin.id}: ${e.message}`,
                );
              }
            } // 🟢 FIN ADICIÓN
          }
        }
        await t.commit();
      } catch (error) {
        await t.rollback();
        console.error(
          `Error al finalizar el mes del proyecto ID ${proyecto.id}:`,
          error,
        );
      }
    }
    return proyectosTerminados;
  },
  /**
   * @async
   * @function findProjectsToRevert
   * @description Busca proyectos 'mensuales' en estado 'En proceso' cuyas suscripciones
   * actuales sean inferiores a las suscripciones mínimas requeridas.
   * @returns {Promise<Proyecto[]>} Lista de proyectos que deben revertirse.
   */ async findProjectsToRevert() {
    return await Proyecto.findAll({
      where: {
        tipo_inversion: "mensual",
        estado_proyecto: "En proceso", // Solo proyectos que están activos // La condición de reversión: sus. actuales < sus. mínimas
        suscripciones_actuales: {
          [Op.lt]: sequelize.col("suscripciones_minimas"),
        },
      },
    });
  },
  /**
   * @async
   * @function getProjectCompletionRate
   * @description Calcula la Tasa de Culminación de Proyectos (número de proyectos Finalizados vs. total iniciado/activo).
   * @returns {Promise<object>} Objeto con las métricas agregadas.
   */
  async getProjectCompletionRate() {
    // 1. Contar el total de proyectos que han pasado de "En Espera" (Iniciado o Activo).
    // Consideramos todos los que NO están en 'En Espera' como "Proyectos Iniciados".
    const totalProyectosIniciados = await Proyecto.count({
      where: {
        // No incluimos 'En Espera' o 'Finalizado'. Los que están en 'En proceso' o 'Pausado' son Iniciados.
        estado_proyecto: {
          [Op.ne]: "En Espera", // Total de proyectos que han sido activados al menos una vez
        },
      },
    });

    if (totalProyectosIniciados === 0) {
      return {
        tasa_culminacion: 0.0,
        total_iniciados: 0,
        total_finalizados: 0,
      };
    }

    // 2. Contar el total de proyectos 'Finalizado' (Numerador del KPI 4).
    const totalProyectosFinalizados = await Proyecto.count({
      where: {
        estado_proyecto: "Finalizado",
      },
    });

    const tasaCulminacion =
      (totalProyectosFinalizados / totalProyectosIniciados) * 100;

    return {
      total_iniciados: totalProyectosIniciados,
      total_finalizados: totalProyectosFinalizados,
      tasa_culminacion: tasaCulminacion.toFixed(2), // KPI 4
    };
  },
  /**
   * @async
   * @function getMonthlyProjectProgress
   * @description Obtiene el porcentaje de avance (suscripciones_actuales / obj_suscripciones)
   * para todos los proyectos activos de tipo 'mensual'.
   * @returns {Promise<object[]>} Lista de proyectos con su porcentaje de avance.
   */
  async getMonthlyProjectProgress() {
    // 1. Obtener todos los proyectos activos y de tipo 'mensual'
    const proyectosMensuales = await Proyecto.findAll({
      where: {
        activo: true,
        tipo_inversion: "mensual",
        obj_suscripciones: { [Op.gt]: 0 }, // Asegurar que el objetivo sea mayor a cero
      },
      attributes: [
        "id",
        "nombre_proyecto",
        "obj_suscripciones",
        "suscripciones_actuales",
        "estado_proyecto",
        // Agregamos el campo calculado para el avance
        [
          sequelize.literal(
            `(suscripciones_actuales * 100.0) / obj_suscripciones`,
          ),
          "porcentaje_avance", // KPI 5 - Progreso
        ],
      ],
      order: [["id", "ASC"]],
      raw: true, // Devuelve un array de objetos planos para un acceso más sencillo
    });

    // 2. Formatear la salida
    return proyectosMensuales.map((p) => ({
      id: p.id,
      nombre: p.nombre_proyecto,
      estado: p.estado_proyecto,
      meta_suscripciones: parseInt(p.obj_suscripciones),
      suscripciones_actuales: parseInt(p.suscripciones_actuales),
      porcentaje_avance: parseFloat(p.porcentaje_avance).toFixed(2),
    }));
  },
};

module.exports = proyectoService;
