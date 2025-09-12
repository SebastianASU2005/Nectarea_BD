const SuscripcionProyecto = require('../models/suscripcion_proyecto');

const suscripcionProyectoService = {
  async create(data) {
    return SuscripcionProyecto.create(data);
  },

  async findAll() {
    return SuscripcionProyecto.findAll();
  },

  async findAllActivo() {
    return SuscripcionProyecto.findAll({
      where: {
        activo: true
      }
    });
  },

  async findById(id) {
    return SuscripcionProyecto.findByPk(id);
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