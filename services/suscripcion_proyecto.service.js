const SuscripcionProyecto = require('../models/suscripcion_proyecto');
const Usuario = require('../models/usuario');
const Proyecto = require('../models/proyecto');
const MensajeService = require('./mensaje.service');
const UsuarioService = require('./usuario.service');
const { sequelize } = require('../config/database');

const suscripcionProyectoService = {
  // Crea una nueva suscripción
  async create(data) {
    const t = await sequelize.transaction();
    try {
      // Obtener el proyecto para inicializar meses_a_pagar
      const proyecto = await Proyecto.findByPk(data.id_proyecto, { transaction: t });
      if (!proyecto) {
        throw new Error('Proyecto asociado no encontrado.');
      }

      // Inicializa los meses a pagar con el plazo total del proyecto
      data.meses_a_pagar = proyecto.plazo_inversion;
      data.saldo_a_favor = 0; // Inicializa el saldo a favor en 0

      const nuevaSuscripcion = await SuscripcionProyecto.create(data, { transaction: t });

      await proyecto.increment('suscripciones_actuales', { by: 1, transaction: t });
      await proyecto.reload({ transaction: t });

      if (proyecto.suscripciones_actuales >= proyecto.obj_suscripciones && !proyecto.objetivo_notificado) {
        await proyecto.update({
          objetivo_notificado: true,
          estado_proyecto: 'En proceso',
        }, { transaction: t });

        const todosLosUsuarios = await UsuarioService.findAllActivos();
        const remitente_id = 1;
        const contenido = `¡Objetivo alcanzado! El proyecto "${proyecto.nombre_proyecto}" ha alcanzado el número de suscripciones necesarias y ahora está en proceso.`;

        for (const usuario of todosLosUsuarios) {
          if (usuario.id !== remitente_id) {
            await MensajeService.crear({
              id_remitente: remitente_id,
              id_receptor: usuario.id,
              contenido: contenido,
            }, { transaction: t });
          }
        }
      }

      await t.commit();
      return nuevaSuscripcion;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  async findUsersByProjectId(projectId) {
    const suscripciones = await SuscripcionProyecto.findAll({
      where: {
        id_proyecto: projectId,
        activo: true,
      },
      include: [{
        model: Usuario,
        as: 'usuario',
        where: { activo: true }
      }]
    });
    return suscripciones.map(suscripcion => suscripcion.usuario);
  },

  async findById(id) {
    return SuscripcionProyecto.findByPk(id);
  },

  async findByUserAndProjectId(userId, projectId) {
    return SuscripcionProyecto.findOne({
      where: {
        id_usuario: userId,
        id_proyecto: projectId,
        activo: true,
      }
    });
  },

  async findAll() {
    return SuscripcionProyecto.findAll();
  },

  async findByUserId(userId) {
    return SuscripcionProyecto.findAll({
      where: { id_usuario: userId, activo: true },
      include: [{
        model: Proyecto,
        as: 'proyecto',
        where: { activo: true }
      }]
    });
  },

  async findSubscriptionsReadyForPayments() {
    return SuscripcionProyecto.findAll({
      where: {
        pago_generado: false
      },
      include: [{
        model: Proyecto,
        as: 'proyecto',
        where: { objetivo_cumplido: true }
      }, Usuario]
    });
  },

  async update(id, data) {
    const suscripcion = await this.findById(id);
    if (!suscripcion) {
      return null;
    }
    return suscripcion.update(data);
  },

  async softDelete(id) {
    const suscripcion = await this.findById(id);
    if (!suscripcion) {
      return null;
    }
    return suscripcion.update({ activo: false });
  }
};

module.exports = suscripcionProyectoService;