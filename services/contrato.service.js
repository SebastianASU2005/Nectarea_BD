const Contrato = require("../models/contrato");
const Proyecto = require("../models/proyecto");
const Inversion = require("../models/inversion");
// Importamos la función de utilidad para generar el hash de un archivo.
const { generateFileHash } = require("../utils/generateFileHash");

/**
 * Servicio de lógica de negocio para la gestión de Contratos,
 * incluyendo la verificación de la integridad del archivo mediante su hash criptográfico.
 */
const contratoService = {
  /**
   * @async
   * @function create
   * @description Crea un nuevo registro de Contrato. Se usa para subir el archivo base
   * o para crear el registro de un contrato firmado único.
   * @param {object} data - Datos del contrato (debe incluir el hash_archivo_original).
   * @returns {Promise<Contrato>} El contrato creado.
   */
  async create(data) {
    return Contrato.create(data);
  },

  /**
   * @async
   * @function findAndVerifyById
   * @description Busca un contrato por ID e inmediatamente verifica la integridad del archivo
   * comparando el hash guardado en DB con el hash calculado del archivo físico.
   * @param {number} id - ID del contrato.
   * @returns {Promise<Contrato|null>} El contrato, con un campo `integrity_compromised` añadido.
   */
  async findAndVerifyById(id) {
    const contrato = await Contrato.findByPk(id, {
      include: [{ model: Proyecto, as: "proyecto" }],
    });

    // Si el contrato existe y tiene un hash de referencia
    if (contrato && contrato.hash_archivo_original) {
      try {
        // Comparamos el hash que está en la DB con el hash del archivo físico
        const hashActual = await generateFileHash(contrato.url_archivo);

        if (hashActual !== contrato.hash_archivo_original) {
          console.warn(
            `🚨 ALERTA DE INTEGRIDAD: Contrato ID ${id} manipulado. Hash esperado: ${contrato.hash_archivo_original}, Hash actual: ${hashActual}`
          );
          // Flag para indicar que la integridad está comprometida
          contrato.dataValues.integrity_compromised = true;
        } else {
          contrato.dataValues.integrity_compromised = false;
        }
      } catch (error) {
        // Manejar el caso de que el archivo físico no exista o no sea accesible
        console.error(
          `Error al verificar integridad del archivo ${contrato.id}:`,
          error.message
        );
        // Marcar como comprometido por falla de acceso
        contrato.dataValues.integrity_compromised = true;
      }
    }
    return contrato;
  },

  /**
   * @async
   * @function findById
   * @description Obtiene un contrato por su ID. Es un alias del método que incluye la verificación de integridad.
   * @param {number} id - ID del contrato.
   * @returns {Promise<Contrato|null>} El contrato con el chequeo de integridad.
   */
  async findById(id) {
    return this.findAndVerifyById(id);
  },

  /**
   * @async
   * @function findByUserId
   * @description Obtiene todos los contratos activos firmados por un usuario específico.
   * (No verifica el hash para optimizar la carga de la lista).
   * @param {number} userId - ID del usuario firmante.
   * @returns {Promise<Contrato[]>} Lista de contratos activos del usuario.
   */
  async findByUserId(userId) {
    return Contrato.findAll({
      where: {
        id_usuario_firmante: userId,
        activo: true,
      },
    });
  },

  /**
   * @async
   * @function createSignedContract
   * @description Crea un registro de contrato firmado, utilizado cuando se genera un contrato único para un usuario.
   * @param {object} uniqueData - Los datos únicos del contrato firmado (URL, Hash, Firma, etc.).
   * @returns {Promise<Contrato>} El nuevo registro de contrato firmado.
   */
  async createSignedContract(uniqueData) {
    return Contrato.create({
      ...uniqueData,
      fecha_firma: new Date(), // Asigna la fecha de firma automáticamente
    });
  },

  /**
   * @async
   * @function update
   * @description Actualiza los campos de un contrato existente por ID.
   * @param {number} id - ID del contrato a actualizar.
   * @param {object} data - Datos a actualizar.
   * @returns {Promise<Contrato|null>} El contrato actualizado o null si no se encuentra.
   */
  async update(id, data) {
    const contrato = await this.findById(id); // Usa findById para obtener el contrato (con verificación de integridad)
    if (!contrato) {
      return null;
    }
    return contrato.update(data);
  },

  /**
   * @async
   * @function softDelete
   * @description Realiza una eliminación lógica (soft delete) marcando el contrato como inactivo.
   * @param {number} id - ID del contrato.
   * @returns {Promise<Contrato|null>} El contrato actualizado o null si no se encuentra.
   */
  async softDelete(id) {
    const contrato = await Contrato.findByPk(id); // Usa findByPk simple aquí para la eliminación
    if (!contrato) {
      return null;
    }
    return contrato.update({ activo: false });
  },

  /**
   * @async
   * @function findAll
   * @description Obtiene todos los contratos (incluye inactivos).
   * @returns {Promise<Contrato[]>} Lista de todos los contratos.
   */
  async findAll() {
    return Contrato.findAll();
  },

  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todos los contratos activos.
   * @returns {Promise<Contrato[]>} Lista de contratos activos.
   */
  async findAllActivo() {
    return Contrato.findAll({
      where: {
        activo: true,
      },
    });
  },

  /**
   * @async
   * @function registerSignature
   * @description Actualiza el registro de un contrato base (plantilla) con los datos de la firma y el vínculo de autorización.
   * @param {number} id_contrato_base - El ID del contrato base a actualizar.
   * @param {object} signatureData - Los datos de la firma (URL, hash, estado, id_inversion_asociada, etc.).
   * @returns {Promise<Contrato>} El contrato actualizado.
   * @throws {Error} Si el contrato base no se encuentra o falla la actualización.
   */
  async registerSignature(id_contrato_base, signatureData) {
    try {
      // 1. Actualiza el registro del contrato base con los datos de firma.
      const [rowsAffected] = await Contrato.update(signatureData, {
        where: { id: id_contrato_base },
        returning: true, // Solicita el objeto actualizado (depende de la configuración del dialecto de Sequelize)
      });

      if (rowsAffected === 0) {
        throw new Error(
          `No se pudo encontrar o actualizar el contrato base con ID ${id_contrato_base}.`
        );
      }

      // 2. Buscamos y retornamos el registro actualizado, usando findById para incluir la verificación de integridad.
      return this.findById(id_contrato_base);
    } catch (error) {
      console.error("Error en registerSignature del servicio:", error);
      throw new Error(`Fallo en el registro de la firma: ${error.message}`);
    }
  },
};

module.exports = contratoService;
