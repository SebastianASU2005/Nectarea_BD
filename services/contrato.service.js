const Contrato = require("../models/contrato");
const Proyecto = require("../models/proyecto");
const Inversion = require("../models/inversion");

const contratoService = {
  // Crea un nuevo registro de contrato
  async create(data) {
    return Contrato.create(data);
  },

  // Obtiene un contrato por su ID, incluyendo el proyecto asociado
  async findById(id) {
    return Contrato.findByPk(id, { include: [{ model: Proyecto, as: 'proyecto' }] });
  },

  // Obtiene los contratos firmados por un usuario específico
  async findByUserId(userId) {
    return Contrato.findAll({
      where: {
        id_usuario_firmante: userId,
        activo: true,
      },
    });
  },

  // Crea un nuevo contrato firmado a partir de uno base
  async createSignedContract(baseContract, firma_digital, id_usuario_firmante) {
    // Clonamos el contrato base con los datos de la firma
    return Contrato.create({
      nombre_archivo: baseContract.nombre_archivo,
      url_archivo: baseContract.url_archivo,
      id_proyecto: baseContract.id_proyecto,
      firma_digital: firma_digital,
      id_usuario_firmante: id_usuario_firmante,
    });
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
        activo: true,
      },
    });
  },
};

module.exports = contratoService;