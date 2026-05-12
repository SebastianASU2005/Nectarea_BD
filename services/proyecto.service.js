// Archivo: services/proyecto.service.js (CON AUDITORÍA PARA ADMINS)

const Proyecto = require("../models/proyecto");
const Lote = require("../models/lote");
const Imagen = require("../models/imagen");
const Inversion = require("../models/inversion");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Usuario = require("../models/usuario");
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const emailService = require("./email.service");
const config = require("../config/config");
const suscripcionProyectoService = require("./suscripcion_proyecto.service");
const mensajeService = require("./mensaje.service");
const usuarioService = require("./usuario.service");
const auditService = require("./audit.service"); // 🆕 Auditoría

const proyectoService = {
  async crearProyecto(projectData, lotesIds) {
    const {
      tipo_inversion,
      obj_suscripciones,
      monto_inversion,
      latitud,
      longitud,
      ...rest
    } = projectData;
    if (!tipo_inversion)
      throw new Error("El tipo de inversión es obligatorio.");
    if ((latitud && !longitud) || (!latitud && longitud)) {
      throw new Error(
        "Si proporciona latitud, debe proporcionar longitud y viceversa.",
      );
    }
    let dataFinal = { ...rest, tipo_inversion };
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

    if (lotesIds && lotesIds.length > 0) {
      const lotesAsignados = await Lote.findAll({
        where: { id: lotesIds, id_proyecto: { [Op.ne]: null } },
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
  },

  async findAll() {
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

  async findAllActivo() {
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

  async findById(id) {
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

  async findByIdActivo(id) {
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

  async findByUserId(userId) {
    return await Proyecto.findAll({
      where: { activo: true },
      include: [
        {
          model: Inversion,
          where: { id_usuario: userId, estado: "pagado" },
          required: true,
        },
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
   * Actualiza un proyecto. Si se proporciona adminContext, registra auditoría.
   * @param {number} id
   * @param {object} data
   * @param {object} [transaction]
   * @param {object} [adminContext] - { adminId, ip, userAgent }
   */
  async update(id, data, transaction = null, adminContext = {}) {
    const { adminId, ip, userAgent } = adminContext;
    const proyecto = await Proyecto.findByPk(id, { transaction });
    if (!proyecto) return null;
    const datosPrevios = proyecto.toJSON();
    const proyectoActualizado = await proyecto.update(data, { transaction });
    if (adminId) {
      await auditService.registrar({
        usuarioId: adminId,
        accion: "ACTUALIZAR_PROYECTO",
        entidadTipo: "Proyecto",
        entidadId: proyecto.id,
        datosPrevios,
        datosNuevos: proyectoActualizado.toJSON(),
        motivo: null,
        ip,
        userAgent,
        transaccion: transaction,
      });
    }
    return proyectoActualizado;
  },

  /**
   * Soft delete (desactivar) con auditoría.
   */
  async softDelete(id, adminContext = {}) {
    const { adminId, ip, userAgent } = adminContext;
    const proyecto = await Proyecto.findByPk(id);
    if (!proyecto) return null;
    const datosPrevios = proyecto.toJSON();
    proyecto.activo = false;
    await proyecto.save();
    if (adminId) {
      await auditService.registrar({
        usuarioId: adminId,
        accion: "DESACTIVAR_PROYECTO",
        entidadTipo: "Proyecto",
        entidadId: proyecto.id,
        datosPrevios,
        datosNuevos: proyecto.toJSON(),
        ip,
        userAgent,
      });
    }
    return proyecto;
  },

  /**
   * Asignar lotes a proyecto con auditoría.
   */
  async asignarLotesAProyecto(proyectoId, lotesIds, adminContext = {}) {
    const { adminId, ip, userAgent } = adminContext;
    if (!lotesIds || lotesIds.length === 0) return;
    const t = await sequelize.transaction();
    try {
      const proyecto = await Proyecto.findByPk(proyectoId, { transaction: t });
      if (!proyecto)
        throw new Error(`Proyecto con ID ${proyectoId} no encontrado.`);
      const lotesConflictivos = await Lote.findAll({
        where: {
          id: lotesIds,
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
      }
      const datosPrevios = proyecto.toJSON();
      const lotes = await Lote.findAll({
        where: { id: lotesIds },
        transaction: t,
      });
      await proyecto.addLotes(lotes, { transaction: t });
      const proyectoActualizado = await Proyecto.findByPk(proyectoId, {
        transaction: t,
      });
      if (adminId) {
        await auditService.registrar({
          usuarioId: adminId,
          accion: "ASIGNAR_LOTES_A_PROYECTO",
          entidadTipo: "Proyecto",
          entidadId: proyecto.id,
          datosPrevios,
          datosNuevos: proyectoActualizado.toJSON(),
          motivo: null,
          ip,
          userAgent,
          transaccion: t,
        });
      }
      await t.commit();
      return proyecto;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  async revertirPorBajoUmbral(proyecto, t) {
    if (proyecto.tipo_inversion !== "mensual") {
      throw new Error("El proyecto no es mensual.");
    }
    await proyecto.reload({ transaction: t });
    const proyectoRevertido = await proyecto.update(
      {
        estado_proyecto: "En Espera",
        fecha_inicio_proceso: null,
        objetivo_notificado: false,
      },
      { transaction: t },
    );
    const suscripcionesActivas = await SuscripcionProyecto.findAll({
      where: { id_proyecto: proyecto.id, activo: true },
      transaction: t,
    });
    const remitente_id = 1;
    const contenidoMensajeInterno = `🚨 ¡Importante! El proyecto "${proyecto.nombre_proyecto}" ha sido PAUSADO temporalmente debido a que el número de suscripciones activas (${proyecto.suscripciones_actuales}) ha caído por debajo del mínimo requerido (${proyecto.suscripciones_minimas}). Dejaremos de generar pagos mensuales hasta que se alcance nuevamente el objetivo de ${proyecto.obj_suscripciones} suscriptores.`;
    for (const suscripcion of suscripcionesActivas) {
      if (!suscripcion.id_usuario) continue;
      await mensajeService.crear(
        {
          id_remitente: remitente_id,
          id_receptor: suscripcion.id_usuario,
          contenido: contenidoMensajeInterno,
        },
        { transaction: t },
      );
      try {
        const usuario = await Usuario.findByPk(suscripcion.id_usuario);
        if (usuario && usuario.email) {
          await emailService.notificarPausaProyecto(usuario, proyecto);
        }
      } catch (error) {
        console.error(
          `Error al enviar el email de pausa al usuario ${suscripcion.id_usuario}:`,
          error.message,
        );
      }
    }
    const admins = await usuarioService.findAllAdmins();
    const contenidoAdmin = `🛑 ALERTA DE REVERSIÓN: El proyecto "${proyecto.nombre_proyecto}" (ID: ${proyecto.id}) ha sido revertido de 'En proceso' a 'En Espera'. Suscripciones activas (${proyecto.suscripciones_actuales}) cayeron por debajo del mínimo (${proyecto.suscripciones_minimas}). Se han pausado los pagos.`;
    for (const admin of admins) {
      await mensajeService.crear(
        {
          id_remitente: remitente_id,
          id_receptor: admin.id,
          contenido: contenidoAdmin,
        },
        { transaction: t },
      );
      if (admin.email) {
        try {
          await emailService.notificarReversionAdmin(admin.email, proyecto);
        } catch (e) {
          console.error(
            `Error al enviar email de reversión al admin ${admin.id}: ${e.message}`,
          );
        }
      }
    }
    return proyectoRevertido;
  },

  async iniciarConteoMensual(proyectoId, adminContext = {}) {
    const { adminId, ip, userAgent } = adminContext;
    const proyecto = await Proyecto.findByPk(proyectoId);
    if (!proyecto) throw new Error("Proyecto no encontrado.");
    if (proyecto.tipo_inversion !== "mensual")
      throw new Error("El proyecto no es de tipo 'mensual'.");
    if (proyecto.estado_proyecto !== "En Espera")
      throw new Error("El proyecto ya ha iniciado o ha finalizado el proceso.");
    if (!proyecto.plazo_inversion || proyecto.plazo_inversion <= 0)
      throw new Error(
        "El proyecto mensual no tiene un 'plazo_inversion' definido.",
      );
    const datosPrevios = proyecto.toJSON();
    const proyectoActualizado = await proyecto.update({
      estado_proyecto: "En proceso",
      fecha_inicio_proceso: new Date(),
      meses_restantes: proyecto.meses_restantes || proyecto.plazo_inversion,
      objetivo_notificado: true,
    });
    if (adminId) {
      await auditService.registrar({
        usuarioId: adminId,
        accion: "INICIAR_CONTEO_MENSUAL",
        entidadTipo: "Proyecto",
        entidadId: proyecto.id,
        datosPrevios,
        datosNuevos: proyectoActualizado.toJSON(),
        motivo: null,
        ip,
        userAgent,
      });
    }
    return proyectoActualizado;
  },

  async findAllActivoMensual() {
    return await Proyecto.findAll({
      where: { activo: true, tipo_inversion: "mensual" },
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

  async findAllActivoDirecto() {
    return await Proyecto.findAll({
      where: { activo: true, tipo_inversion: "directo" },
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

  async finalizarMes() {
    const proyectosTerminados = [];
    const remitente_id = 1;
    const proyectosActivos = await Proyecto.findAll({
      where: {
        estado_proyecto: "En proceso",
        tipo_inversion: "mensual",
        meses_restantes: { [Op.gt]: 0 },
      },
    });
    for (const proyecto of proyectosActivos) {
      const t = await sequelize.transaction();
      try {
        await proyecto.decrement("meses_restantes", { by: 1, transaction: t });
        await proyecto.reload({ transaction: t });
        if (proyecto.meses_restantes <= 0) {
          proyectosTerminados.push(proyecto);
          const admins = await usuarioService.findAllAdmins();
          const contenidoAdmin = `✅ ¡Alerta de Finalización de Plazo! El plazo total de ${proyecto.plazo_inversion} meses para el proyecto "${proyecto.nombre_proyecto}" ha terminado. Por favor, revisa si quedan suscripciones activas con meses a pagar, si hay lotes pendientes de subastar o si el proyecto debe ser marcado como 'Finalizado'.`;
          for (const admin of admins) {
            await mensajeService.crear(
              {
                id_remitente: remitente_id,
                id_receptor: admin.id,
                contenido: contenidoAdmin,
              },
              { transaction: t },
            );
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
            }
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

  async findProjectsToRevert() {
    return await Proyecto.findAll({
      where: {
        tipo_inversion: "mensual",
        estado_proyecto: "En proceso",
        suscripciones_actuales: {
          [Op.lt]: sequelize.col("suscripciones_minimas"),
        },
      },
    });
  },

  async getProjectCompletionRate(fechaInicio = null, fechaFin = null) {
    const whereIniciados = { estado_proyecto: { [Op.ne]: "En Espera" } };
    if (fechaInicio)
      whereIniciados.fecha_inicio_proceso = { [Op.gte]: fechaInicio };
    if (fechaFin)
      whereIniciados.fecha_inicio_proceso = {
        ...whereIniciados.fecha_inicio_proceso,
        [Op.lte]: fechaFin,
      };
    const totalIniciados = await Proyecto.count({ where: whereIniciados });
    if (totalIniciados === 0) {
      return {
        tasa_culminacion: 0.0,
        total_iniciados: 0,
        total_finalizados: 0,
      };
    }
    const whereFinalizados = { estado_proyecto: "Finalizado" };
    if (fechaInicio)
      whereFinalizados.fecha_inicio_proceso = { [Op.gte]: fechaInicio };
    if (fechaFin)
      whereFinalizados.fecha_inicio_proceso = {
        ...whereFinalizados.fecha_inicio_proceso,
        [Op.lte]: fechaFin,
      };
    const totalFinalizados = await Proyecto.count({ where: whereFinalizados });
    const tasaCulminacion = (totalFinalizados / totalIniciados) * 100;
    return {
      total_iniciados: totalIniciados,
      total_finalizados: totalFinalizados,
      tasa_culminacion: tasaCulminacion.toFixed(2),
    };
  },

  async getMonthlyProjectProgress() {
    const proyectosMensuales = await Proyecto.findAll({
      where: {
        activo: true,
        tipo_inversion: "mensual",
        obj_suscripciones: { [Op.gt]: 0 },
      },
      attributes: [
        "id",
        "nombre_proyecto",
        "obj_suscripciones",
        "suscripciones_actuales",
        "estado_proyecto",
        [
          sequelize.literal(
            `(suscripciones_actuales * 100.0) / obj_suscripciones`,
          ),
          "porcentaje_avance",
        ],
      ],
      order: [["id", "ASC"]],
      raw: true,
    });
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
