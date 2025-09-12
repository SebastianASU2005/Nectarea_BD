const Contrato = require('../models/contrato');

const contratoService = {
  // Crea un nuevo registro de contrato
  async create(data) {
    return Contrato.create(data);
  },

  // Obtiene un contrato por su ID, incluyendo el proyecto asociado (si existe la relación)
  async findById(id) {
    // Si tienes una asociación definida, puedes usar 'include' para traer datos relacionados
    return Contrato.findByPk(id);
  },

  // Actualiza un contrato, útil para agregar la firma digital
  async update(id, data) {
    const contrato = await this.findById(id);
    if (!contrato) {
      return null;
    }
    return contrato.update(data);
  },

  // Elimina un contrato (soft delete)
  async softDelete(id) {
    const contrato = await this.findById(id);
    if (!contrato) {
      return null;
    }
    return contrato.update({ activo: false });
  },

  // Obtiene todos los contratos
  async findAll() {
    return Contrato.findAll();
  },

  // Obtiene todos los contratos activos
  async findAllActivo() {
    return Contrato.findAll({
      where: {
        activo: true
      }
    });
  }
};

module.exports = contratoService;
