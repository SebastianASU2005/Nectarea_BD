const Inversion = require("../models/inversion");
const Proyecto = require("../models/proyecto");
const { sequelize } = require("../config/database");

/**
 * Servicio de lógica de negocio para la gestión de Inversiones Directas en Proyectos.
 */
const inversionService = {
  /**
   * @async
   * @function crearInversion
   * @description Crea un registro de inversión directa con estado 'pendiente'.
   * Valida que el proyecto exista, esté activo y sea de tipo 'directo'.
   * @param {object} data - Datos de la inversión a crear, incluyendo id_proyecto y id_usuario.
   * @returns {Promise<Inversion>} La inversión creada con estado 'pendiente'.
   * @throws {Error} Si el proyecto no es encontrado, está inactivo, o no es de tipo 'directo'.
   */
  async crearInversion(data) {
    const { id_proyecto, id_usuario } = data;

    // 1. Validar el Proyecto
    const proyecto = await Proyecto.findByPk(id_proyecto);
    if (!proyecto) {
      throw new Error("Proyecto no encontrado.");
    }

    // 2. Restricciones de estado del proyecto
    if (
      proyecto.estado_proyecto === "Finalizado" ||
      proyecto.estado_proyecto === "Cancelado"
    ) {
      throw new Error(
        `No se puede crear una inversión, el proyecto "${proyecto.nombre_proyecto}" está en estado: ${proyecto.estado_proyecto}.`
      );
    }

    // 3. Restricción de tipo de inversión (solo "directo" para este servicio)
    if (proyecto.tipo_inversion !== "directo") {
      throw new Error(
        "Solo se pueden crear inversiones directas en proyectos de tipo 'directo'."
      );
    }

    // 4. Validar el monto
    const montoInversion = proyecto.monto_inversion;
    if (montoInversion === null || typeof montoInversion === "undefined") {
      throw new Error(
        "El monto de inversión del proyecto es nulo. No se puede registrar la inversión."
      );
    }

    const t = await sequelize.transaction();

    try {
      // 5. Crear la inversión con estado "pendiente" dentro de la transacción
      const nuevaInversion = await Inversion.create(
        {
          id_usuario: id_usuario,
          id_proyecto: id_proyecto,
          monto: montoInversion,
          estado: "pendiente",
        },
        { transaction: t }
      );
      await t.commit();

      return nuevaInversion;
    } catch (error) {
      await t.rollback();
      throw new Error(`Error al crear inversión: ${error.message}`);
    }
  },

  /**
   * @async
   * @function confirmarInversion
   * @description Confirma una inversión pendiente a 'pagado', actualiza el monto fondeado
   * del proyecto, y finaliza el proyecto si es de tipo 'directo'.
   * **Debe ejecutarse dentro de una transacción mayor** (por ejemplo, al confirmar el pago).
   * @param {number} inversionId - ID de la inversión.
   * @param {object} t - Objeto de transacción de Sequelize.
   * @returns {Promise<Inversion>} La inversión actualizada.
   * @throws {Error} Si la inversión o el proyecto no son encontrados.
   */
  async confirmarInversion(inversionId, t) {
    // 1. Encontrar la inversión
    const inversion = await Inversion.findByPk(inversionId, {
      transaction: t,
    });
    if (!inversion) {
      throw new Error("Inversión asociada a la transacción no encontrada.");
    }
    if (inversion.estado === "pagado") {
      return inversion; // Idempotencia: ya pagado
    }

    // 2. Encontrar el proyecto
    const proyecto = await Proyecto.findByPk(inversion.id_proyecto, {
      transaction: t,
    });
    if (!proyecto) {
      throw new Error("Proyecto asociado a la inversión no encontrado.");
    }

    // 3. Actualizar el monto de fondeo (suscripciones_actuales)
    const montoInvertido = Number(inversion.monto);
    const montoActual = Number(proyecto.suscripciones_actuales || 0);
    const nuevoMontoTotal = montoActual + montoInvertido;

    await proyecto.update(
      {
        suscripciones_actuales: nuevoMontoTotal,
      },
      { transaction: t }
    );

    // 4. Marcar la inversión como 'pagado'
    inversion.estado = "pagado";
    await inversion.save({
      transaction: t,
    });

    // 5. Si el proyecto es de tipo "directo" (inversión única), finalizarlo
    if (proyecto.tipo_inversion === "directo") {
      proyecto.estado_proyecto = "Finalizado";
      await proyecto.save({
        transaction: t,
      });
    }

    return inversion;
  },

  // --- Funciones CRUD básicas ---

  /**
   * @async
   * @function findById
   * @description Obtiene una inversión por su clave primaria.
   * @param {number} id - ID de la inversión.
   * @returns {Promise<Inversion|null>} La inversión encontrada.
   */
  async findById(id) {
    return await Inversion.findByPk(id);
  },

  /**
   * @async
   * @function findAll
   * @description Obtiene todos los registros de inversiones.
   * @returns {Promise<Inversion[]>} Lista de todas las inversiones.
   */
  async findAll() {
    return await Inversion.findAll();
  },

  /**
   * @async
   * @function findByUserId
   * @description Obtiene todas las inversiones de un usuario específico.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<Inversion[]>} Lista de inversiones del usuario.
   */
  async findByUserId(userId) {
    return await Inversion.findAll({
      where: {
        id_usuario: userId,
      },
    });
  },

  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todas las inversiones que no están eliminadas lógicamente.
   * @returns {Promise<Inversion[]>} Lista de inversiones activas.
   */
  async findAllActivo() {
    return await Inversion.findAll({
      where: {
        activo: true,
      },
    });
  },

  /**
   * @async
   * @function update
   * @description Actualiza los datos de una inversión por ID.
   * @param {number} id - ID de la inversión.
   * @param {object} data - Datos a actualizar.
   * @returns {Promise<Inversion|null>} La inversión actualizada o null.
   */
  async update(id, data) {
    const inversion = await Inversion.findByPk(id);
    if (!inversion) return null;
    return await inversion.update(data);
  },

  /**
   * @async
   * @function softDelete
   * @description Realiza una eliminación lógica (soft delete) marcando la inversión como inactiva.
   * @param {number} id - ID de la inversión.
   * @returns {Promise<Inversion|null>} La inversión actualizada o null.
   */
  async softDelete(id) {
    const inversion = await Inversion.findByPk(id);
    if (!inversion) return null;
    return await inversion.update({
      activo: false,
    });
  },
};

module.exports = inversionService;
