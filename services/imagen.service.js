const Imagen = require("../models/imagen");
const { Op } = require("sequelize"); // Se mantiene por convención.

/**
 * Servicio de lógica de negocio para la gestión del modelo Imagen.
 */
const imagenService = {
  /**
   * @async
   * @function create
   * @description Crea un nuevo registro de Imagen, validando que solo se asigne a un recurso (Proyecto O Lote).
   * @param {object} data - Datos de la imagen a crear (url, id_proyecto, id_lote, etc.).
   * @returns {Promise<Imagen>} La imagen creada.
   * @throws {Error} Si se intenta asignar la imagen a un proyecto Y un lote.
   */
  async create(data) {
    const { id_proyecto, id_lote } = data;

    // Validación de uso único (Proyecto O Lote)
    if (id_proyecto && id_lote) {
      throw new Error(
        "Una imagen solo puede ser asignada a un Proyecto O a un Lote, no a ambos."
      );
    }

    return await Imagen.create(data);
  },

  /**
   * @async
   * @function findAll
   * @description Obtiene todas las imágenes registradas (incluye inactivas, para uso administrativo).
   * @returns {Promise<Imagen[]>} Lista de todas las imágenes.
   */
  async findAll() {
    return await Imagen.findAll();
  },

  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todas las imágenes que están marcadas como activas.
   * @returns {Promise<Imagen[]>} Lista de imágenes activas.
   */
  async findAllActivo() {
    return await Imagen.findAll({ where: { activo: true } });
  },

  /**
   * @async
   * @function findByProjectIdActivo
   * @description Obtiene todas las imágenes activas asociadas a un Proyecto específico.
   * @param {number} id_proyecto - ID del proyecto.
   * @returns {Promise<Imagen[]>} Lista de imágenes activas del proyecto.
   */
  async findByProjectIdActivo(id_proyecto) {
    return await Imagen.findAll({
      where: {
        id_proyecto: id_proyecto,
        activo: true,
      },
      order: [["id", "ASC"]], // Ordenar para asegurar consistencia en la visualización
    });
  },

  /**
   * @async
   * @function findByLoteIdActivo
   * @description Obtiene todas las imágenes activas asociadas a un Lote específico.
   * @param {number} id_lote - ID del lote.
   * @returns {Promise<Imagen[]>} Lista de imágenes activas del lote.
   */
  async findByLoteIdActivo(id_lote) {
    return await Imagen.findAll({
      where: {
        id_lote: id_lote,
        activo: true,
      },
      order: [["id", "ASC"]], // Ordenar para asegurar consistencia en la visualización
    });
  },

  /**
   * @async
   * @function findById
   * @description Obtiene una imagen por ID (incluye inactivas, para uso administrativo).
   * @param {number} id - ID de la imagen.
   * @returns {Promise<Imagen|null>} La imagen encontrada.
   */
  async findById(id) {
    return await Imagen.findByPk(id);
  },

  /**
   * @async
   * @function findByIdActivo
   * @description Obtiene una imagen por ID, verificando que esté activa.
   * @param {number} id - ID de la imagen.
   * @returns {Promise<Imagen|null>} La imagen activa encontrada.
   */
  async findByIdActivo(id) {
    return await Imagen.findOne({ where: { id: id, activo: true } });
  },

  /**
   * @async
   * @function update
   * @description Actualiza los datos de una imagen por ID. Incluye validación de uso único.
   * @param {number} id - ID de la imagen.
   * @param {object} data - Datos a actualizar.
   * @returns {Promise<Imagen|null>} La imagen actualizada o null si no se encuentra.
   * @throws {Error} Si se intenta asignar la imagen a un proyecto Y un lote.
   */
  async update(id, data) {
    const imagen = await Imagen.findByPk(id);
    if (!imagen) {
      return null;
    }

    const { id_proyecto, id_lote } = data;
    // Validación de uso único (Proyecto O Lote) en la actualización
    if (id_proyecto && id_lote) {
      throw new Error(
        "Una imagen solo puede ser asignada a un Proyecto O a un Lote, no a ambos."
      );
    }

    return await imagen.update(data);
  },

  /**
   * @async
   * @function softDelete
   * @description Realiza una eliminación lógica (soft delete) marcando la imagen como inactiva.
   * @param {number} id - ID de la imagen.
   * @returns {Promise<Imagen|null>} La imagen actualizada o null si no se encuentra.
   */
  async softDelete(id) {
    const imagen = await Imagen.findByPk(id);
    if (!imagen) {
      return null;
    }
    imagen.activo = false;
    return await imagen.save();
  },

  /**
   * @async
   * @function findUnassignedActivo
   * @description Obtiene todas las imágenes activas que NO tienen un proyecto ni un lote asignado.
   * @returns {Promise<Imagen[]>} Lista de imágenes activas sin asignar.
   */
  async findUnassignedActivo() {
    return await Imagen.findAll({
      where: {
        activo: true,
        id_proyecto: null,
        id_lote: null,
      },
      order: [["id", "ASC"]],
    });
  },
};

module.exports = imagenService;
