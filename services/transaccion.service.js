const Transaccion = require("../models/transaccion");
const Proyecto = require("../models/proyecto");
const Pago = require("../models/pago");
const Inversion = require("../models/inversion");
const Puja = require("../models/puja");
const { sequelize } = require('../config/database');

const transaccionService = {
  // Función para crear una nueva transacción
  async create(data, options = {}) {
    return Transaccion.create(data, options);
  },

  // Confirma una transacción y desencadena la lógica de negocio
  async confirmarTransaccion(transaccionId, estado) {
    const PujaService = require('./puja.service');
    const PagoService = require('./pago.service');

    const t = await sequelize.transaction();
    try {
      const transaccion = await Transaccion.findByPk(transaccionId, { transaction: t, include: [{ model: Puja, as: 'puja' }] });
      if (!transaccion) throw new Error('Transacción no encontrada.');
      if (transaccion.estado_transaccion === 'pagado') {
        await t.rollback();
        return transaccion;
      }

      await transaccion.update({ estado_transaccion: estado }, { transaction: t });

      if (estado === 'pagado') {
        if (transaccion.puja) {
          // Si la transacción está ligada a una puja, procesamos la puja ganadora
         await PujaService.procesarPujaGanadora(transaccion.puja.id)// Pasamos el ID de la puja
        } else if (transaccion.id_pago) {
          await PagoService.markAsPaid(transaccion.id_pago);
        }
      }

      await t.commit();
      return transaccion;

    } catch (error) {
      await t.rollback();
      throw error;
    }
  },


  // Obtiene TODAS las transacciones
  async findAll() {
    return Transaccion.findAll();
  },

  // Encuentra TODAS las transacciones ACTIVAS
  async findAllActivo() {
    return Transaccion.findAll({ where: { activo: true } });
  },

  // Encuentra una transacción por su ID
  async findById(id) {
    return Transaccion.findByPk(id);
  },

  // Obtiene las transacciones de un usuario
  async findByUserId(userId) {
    return Transaccion.findAll({
      where: { id_usuario: userId, activo: true },
      include: [
        { model: Proyecto, as: "proyecto" },
        { model: Pago, as: "pago" },
        { model: Inversion, as: "inversion" },
        { model: Puja, as: "puja" }, // Asegúrate de incluir la relación de Puja
      ],
    });
  },

  // Obtiene una transacción por ID y la vincula a un usuario
  async findByIdAndUserId(id, userId) {
    return Transaccion.findOne({
      where: { id: id, id_usuario: userId, activo: true },
      include: [
        { model: Proyecto, as: "proyecto" },
        { model: Pago, as: "pago" },
        { model: Inversion, as: "inversion" },
        { model: Puja, as: "puja" },
      ],
    });
  },

  // Actualiza una transacción
  async update(id, data) {
    const transaccion = await this.findById(id);
    if (!transaccion) return null;
    return transaccion.update(data);
  },

  // Actualiza una transacción propia
  async updateByIdAndUserId(id, userId, data) {
    const transaccion = await this.findByIdAndUserId(id, userId);
    if (!transaccion) return null;
    return transaccion.update(data);
  },

  // "Elimina" una transacción (soft delete)
  async softDelete(id) {
    const transaccion = await this.findById(id);
    if (!transaccion) return null;
    return transaccion.update({ activo: false });
  },

  // "Elimina" una transacción propia
  async softDeleteByIdAndUserId(id, userId) {
    const transaccion = await this.findByIdAndUserId(id, userId);
    if (!transaccion) return null;
    return transaccion.update({ activo: false });
  },
};

module.exports = transaccionService;
