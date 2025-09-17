const SuscripcionProyecto = require('../models/suscripcion_proyecto');
const Usuario = require('../models/usuario');
const Proyecto = require('../models/proyecto');
const MensajeService = require('./mensaje.service');
const UsuarioService = require('./usuario.service');
const { sequelize } = require('../config/database');

const suscripcionProyectoService = {
  // Crea una nueva suscripción y notifica si se alcanza el objetivo del proyecto
  async create(data) {
    const t = await sequelize.transaction();
    try {
      const nuevaSuscripcion = await SuscripcionProyecto.create(data, { transaction: t });

      // 1. Obtener el proyecto para actualizar el contador
      const proyecto = await Proyecto.findByPk(nuevaSuscripcion.id_proyecto, { transaction: t });
      if (!proyecto) {
        throw new Error('Proyecto asociado no encontrado.');
      }

      // 2. Incrementar el contador de suscripciones y guardar
      await proyecto.increment('suscripciones_actuales', { by: 1, transaction: t });
      await proyecto.reload({ transaction: t }); // Recargar para obtener el valor actualizado

      // 3. Verificar si el objetivo se ha cumplido y si ya se notificó
      if (proyecto.suscripciones_actuales >= proyecto.obj_suscripciones && !proyecto.objetivo_notificado) {
        // 4. Si se cumplió, notificar a los suscriptores y actualizar el proyecto
        await proyecto.update({
          objetivo_notificado: true,
          estado_proyecto: 'En proceso',
        }, { transaction: t });

        // 5. Enviar mensajes a todos los usuarios activos
        const todosLosUsuarios = await UsuarioService.findAllActivos();
        const remitente_id = 1;
        const contenido = `¡Objetivo alcanzado! El proyecto "${proyecto.nombre_proyecto}" ha alcanzado el número de suscripciones necesarias y ahora está en proceso.`;

        for (const usuario of todosLosUsuarios) {
          if (usuario.id !== remitente_id) {
            await MensajeService.crear({ // CORRECCIÓN: Se cambió de .create a .crear
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
  // Obtiene todos los usuarios suscritos a un proyecto
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

  // Obtiene una suscripción por su ID
  async findById(id) {
    return SuscripcionProyecto.findByPk(id);
  },

  // Obtiene una suscripción por usuario y proyecto
  async findByUserAndProjectId(userId, projectId) {
    return SuscripcionProyecto.findOne({
      where: {
        id_usuario: userId,
        id_proyecto: projectId,
        activo: true,
      }
    });
  },

  // Obtiene todas las suscripciones
  async findAll() {
    return SuscripcionProyecto.findAll();
  },

  // Obtiene todas las suscripciones de un usuario
  async findByUserId(userId) {
    return SuscripcionProyecto.findAll({
      where: { id_usuario: userId, activo: true }
    });
  },

  // Encuentra suscripciones con el objetivo cumplido que están a punto de iniciar pagos
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

  // Actualiza una suscripción
  async update(id, data) {
    const suscripcion = await this.findById(id);
    if (!suscripcion) {
      return null;
    }
    return suscripcion.update(data);
  },

  // "Elimina" una suscripción (soft delete)
  async softDelete(id) {
    const suscripcion = await this.findById(id);
    if (!suscripcion) {
      return null;
    }
    return suscripcion.update({ activo: false });
  }
};

module.exports = suscripcionProyectoService;