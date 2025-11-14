// services/contratoGeneralService.js
const ContratoFirmado = require("../models/ContratoFirmado ");
const { Op } = require("sequelize"); // Se mantiene la importación, aunque Op no se usa directamente en este archivo.

/**
 * Servicio de lógica de negocio para la gestión de Contratos Firmados.
 * Se enfoca en las operaciones de **consulta** (lectura) y la **aplicación de permisos**
 * para la descarga segura de archivos.
 */
const contratoGeneralService = {
  /**
   * Obtiene todos los contratos firmados en el sistema.
   * **Restringido a usuarios Administradores o con permisos de auditoría.**
   * @returns {Promise<ContratoFirmado[]>} Lista completa de contratos, ordenados por ID descendente.
   */
  async findAll() {
    return ContratoFirmado.findAll({
      order: [["id", "DESC"]],
    });
  },

  /**
   * Obtiene un contrato firmado específico por su ID.
   * @param {number} id - ID del Contrato Firmado.
   * @returns {Promise<ContratoFirmado|null>} El contrato encontrado.
   */
  async findByPk(id) {
    return ContratoFirmado.findByPk(id);
  },

  /**
   * Obtiene todos los contratos firmados donde el usuario autenticado figura como firmante.
   * @param {number} id_usuario - ID del usuario solicitante.
   * @returns {Promise<ContratoFirmado[]>} Lista de contratos asociados al usuario, ordenados por ID descendente.
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
   * Verifica la existencia de un contrato y aplica la **lógica de permisos**
   * para determinar si el usuario autenticado tiene derecho a descargarlo.
   * @param {number} id_contrato - ID del contrato firmado solicitado.
   * @param {number} id_usuario - ID del usuario autenticado.
   * @param {boolean} isAdmin - Indica si el usuario tiene rol de Administrador.
   * @returns {Promise<ContratoFirmado|null>} El contrato (con campos mínimos para descarga) si el permiso es concedido, o `null` en caso contrario.
   */
  async getContractForDownload(id_contrato, id_usuario, isAdmin = false) {
    let whereClause = {
      id: id_contrato,
    };

    // Lógica de seguridad: Si NO es administrador, debe ser el firmante del contrato.
    if (!isAdmin) {
      whereClause.id_usuario_firmante = id_usuario;
    }

    // Busca el contrato aplicando el filtro de ID y, si no es Admin, el filtro de `id_usuario_firmante`.
    const contrato = await ContratoFirmado.findOne({
      where: whereClause,
      // Solo se seleccionan los atributos necesarios para la descarga segura (URL, nombre y confirmación de firmante).
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
  