const Imagen = require("../models/imagen");
const { Op } = require("sequelize"); // Se mantiene para el uso potencial de operadores avanzados de Sequelize.

/**
 * @typedef {object} ImagenData
 * @property {string} url - URL de la imagen.
 * @property {number} [id_proyecto] - ID opcional del proyecto al que pertenece.
 * @property {number} [id_lote] - ID opcional del lote al que pertenece.
 * @property {boolean} [activo] - Estado de la imagen.
 */

/**
 * Servicio de lógica de negocio para la gestión del modelo Imagen.
 * Asegura que una imagen solo esté asociada a un proyecto O un lote, nunca a ambos.
 */
const imagenService = {
  /**
   * @async
   * @function create
   * @description Crea un nuevo registro de Imagen, validando la regla de asignación única (Proyecto O Lote).
   * @param {ImagenData} data - Datos de la imagen a crear (url, id_proyecto, id_lote, etc.).
   * @returns {Promise<Imagen>} La instancia de la imagen creada.
   * @throws {Error} Si se intenta asignar la imagen a un proyecto Y un lote simultáneamente.
   */
  async create(data) {
    const { id_proyecto, id_lote } = data; // Regla de negocio: Validación de uso único (Proyecto O Lote)

    if (id_proyecto && id_lote) {
      throw new Error(
        "Una imagen solo puede ser asignada a un Proyecto O a un Lote, no a ambos."
      );
    } // Crear la imagen en la base de datos con los datos proporcionados.

    return await Imagen.create(data);
  }
  /**
   * @async
   * @function findAll
   * @description Obtiene todas las imágenes registradas (incluye inactivas, para uso administrativo o de auditoría).
   * @returns {Promise<Imagen[]>} Lista completa de todas las imágenes.
   */,

  async findAll() {
    return await Imagen.findAll();
  }
  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todas las imágenes que están marcadas como activas.
   * @returns {Promise<Imagen[]>} Lista de imágenes activas disponibles para mostrar.
   */,

  async findAllActivo() {
    return await Imagen.findAll({ where: { activo: true } });
  }
  /**
   * @async
   * @function findByProjectIdActivo
   * @description Obtiene todas las imágenes activas asociadas a un Proyecto específico.
   * @param {number} id_proyecto - ID del proyecto.
   * @returns {Promise<Imagen[]>} Lista de imágenes activas del proyecto, ordenadas por ID.
   */,

  async findByProjectIdActivo(id_proyecto) {
    return await Imagen.findAll({
      where: {
        id_proyecto: id_proyecto,
        activo: true,
      },
      order: [["id", "ASC"]], // Ordenar para asegurar una consistencia en la visualización (e.g., carruseles).
    });
  }
  /**
   * @async
   * @function findByLoteIdActivo
   * @description Obtiene todas las imágenes activas asociadas a un Lote específico.
   * @param {number} id_lote - ID del lote.
   * @returns {Promise<Imagen[]>} Lista de imágenes activas del lote, ordenadas por ID.
   */,

  async findByLoteIdActivo(id_lote) {
    return await Imagen.findAll({
      where: {
        id_lote: id_lote,
        activo: true,
      },
      order: [["id", "ASC"]], // Ordenar para asegurar una consistencia en la visualización (e.g., galerías).
    });
  }
  /**
   * @async
   * @function findById
   * @description Obtiene una imagen por su clave primaria (ID). Incluye imágenes inactivas.
   * @param {number} id - ID de la imagen.
   * @returns {Promise<Imagen|null>} La imagen encontrada o `null` si no existe.
   */,

  async findById(id) {
    return await Imagen.findByPk(id);
  }
  /**
   * @async
   * @function findByIdActivo
   * @description Obtiene una imagen por ID, solo si está marcada como activa.
   * @param {number} id - ID de la imagen.
   * @returns {Promise<Imagen|null>} La imagen activa encontrada o `null` si no existe o está inactiva.
   */,

  async findByIdActivo(id) {
    return await Imagen.findOne({ where: { id: id, activo: true } });
  }
  /**
   * @async
   * @function update
   * @description Actualiza los datos de una imagen por ID, incluyendo la validación de uso único.
   * @param {number} id - ID de la imagen a actualizar.
   * @param {ImagenData} data - Los datos a aplicar a la imagen (url, activo, id_proyecto, id_lote, etc.).
   * @returns {Promise<[number, Imagen[]]>} La imagen actualizada o `null` si no se encuentra.
   * @throws {Error} Si la actualización intenta asignar la imagen a un proyecto Y un lote.
   */,

  async update(id, data) {
    const imagen = await Imagen.findByPk(id);
    if (!imagen) {
      return null; // Retorna null si la imagen no existe.
    } // Obtener los nuevos IDs del payload o mantener los IDs actuales de la instancia si no se están actualizando.

    const id_proyecto_final =
      data.id_proyecto !== undefined ? data.id_proyecto : imagen.id_proyecto;
    const id_lote_final =
      data.id_lote !== undefined ? data.id_lote : imagen.id_lote; // Regla de negocio: Validación de uso único (Proyecto O Lote) en la actualización

    if (id_proyecto_final && id_lote_final) {
      throw new Error(
        "Una imagen solo puede ser asignada a un Proyecto O a un Lote, no a ambos."
      );
    }

    return await imagen.update(data);
  }
  /**
   * @async
   * @function softDelete
   * @description Realiza una eliminación lógica (soft delete) marcando la imagen como inactiva (`activo = false`).
   * @param {number} id - ID de la imagen a inactivar.
   * @returns {Promise<Imagen|null>} La imagen actualizada (inactiva) o `null` si no se encuentra.
   */,

  async softDelete(id) {
    const imagen = await Imagen.findByPk(id);
    if (!imagen) {
      return null;
    } // Realizar la eliminación lógica.
    imagen.activo = false;
    return await imagen.save();
  }
  /**
   * @async
   * @function findUnassignedActivo
   * @description Obtiene todas las imágenes activas que NO tienen un proyecto ni un lote asignado (`id_proyecto` y `id_lote` son NULL).
   * @returns {Promise<Imagen[]>} Lista de imágenes activas sin asignar, ordenadas por ID.
   */,

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
