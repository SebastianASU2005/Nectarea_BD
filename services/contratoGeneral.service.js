// services/contratoGeneralService.js
const ContratoFirmado = require("../models/ContratoFirmado ");
const { Op } = require("sequelize");

/**
 * Servicio de lógica de negocio para la gestión de Contratos Firmados.
 * Se enfoca en la consulta, listado y preparación de datos para la descarga segura.
 */
const contratoGeneralService = {
  /**
   * @async
   * @function findAll
   * @description Obtiene todos los contratos firmados en el sistema (Solo Admin).
   * @returns {Promise<ContratoFirmado[]>} Lista de todos los contratos.
   */
  async findAll() {
    return ContratoFirmado.findAll({
      order: [["id", "DESC"]],
    });
  },

  /**
   * @async
   * @function findByPk
   * @description Obtiene un contrato firmado específico por su ID.
   * @param {number} id - ID del Contrato Firmado.
   * @returns {Promise<ContratoFirmado|null>} El contrato.
   */
  async findByPk(id) {
    return ContratoFirmado.findByPk(id);
  },

  /**
   * @async
   * @function findByUserId
   * @description Obtiene todos los contratos firmados donde el usuario participa.
   * @param {number} id_usuario - ID del usuario.
   * @returns {Promise<ContratoFirmado[]>} Lista de contratos del usuario.
   */
  async findByUserId(id_usuario) {
    return ContratoFirmado.findAll({
      where: {
        id_usuario_firmante: id_usuario,
      },
      order: [["id", "DESC"]],
    });
  },

  /**
   * @async
   * @function getContractForDownload
   * @description Verifica si un contrato existe y si el usuario tiene permiso para descargarlo.
   * @param {number} id_contrato - ID del contrato firmado solicitado.
   * @param {number} id_usuario - ID del usuario autenticado.
   * @param {boolean} isAdmin - Indica si el usuario es administrador.
   * @returns {Promise<ContratoFirmado|null>} El contrato si el permiso es concedido.
   */
  async getContractForDownload(id_contrato, id_usuario, isAdmin = false) {
    let whereClause = {
      id: id_contrato,
    };

    if (!isAdmin) {
      whereClause.id_usuario_firmante = id_usuario;
    }

    const contrato = await ContratoFirmado.findOne({
      where: whereClause,
      attributes: [
        "id",
        "url_archivo",
        "nombre_archivo",
        "id_usuario_firmante",
      ],
    });

    return contrato;
  },
};

module.exports = contratoGeneralService;
