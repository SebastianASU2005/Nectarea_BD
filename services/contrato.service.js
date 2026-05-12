const Contrato = require("../models/contrato");
const Proyecto = require("../models/proyecto");
const Inversion = require("../models/inversion");
const storageService = require("./storage"); // ✅

/**
 * Servicio de lógica de negocio para la gestión de Contratos.
 * Incluye métodos cruciales para la **verificación de la integridad** del archivo
 * comparando su hash guardado con el hash calculado del archivo físico.
 */
const contratoService = {
  /**
   * Crea un nuevo registro de Contrato en la base de datos.
   * Se utiliza para cargar la plantilla base o para registrar un contrato firmado.
   * @param {object} data - Datos del contrato.
   * @returns {Promise<Contrato>} El contrato recién creado.
   */
  async create(data) {
    return Contrato.create(data);
  },

  /**
   * Busca un contrato por su ID y realiza una verificación de integridad crítica.
   * Compara el **hash criptográfico** guardado en la DB (`hash_archivo_original`)
   * con el hash calculado del archivo físico actual (`url_archivo`).
   * @param {number} id - ID del contrato.
   * @returns {Promise<Contrato|null>} El contrato con el campo `integrity_compromised` (booleano) añadido para indicar manipulación.
   */
  async findAndVerifyById(id) {
    const contrato = await Contrato.findByPk(id, {
      include: [{ model: Proyecto, as: "proyecto" }],
    });
    if (contrato && contrato.hash_archivo_original) {
      try {
        const hashActual = await storageService.calculateHashFromFile(
          contrato.url_archivo,
        );
        contrato.dataValues.integrity_compromised =
          hashActual !== contrato.hash_archivo_original;
      } catch (error) {
        contrato.dataValues.integrity_compromised = true;
      }
    }
    return contrato;
  },

  /**
   * Obtiene un contrato por su ID. Es un alias que invoca la función de verificación.
   * @param {number} id - ID del contrato.
   * @returns {Promise<Contrato|null>} El contrato con el resultado del chequeo de integridad.
   */
  async findById(id) {
    return this.findAndVerifyById(id);
  },

  /**
   * Obtiene todos los contratos marcados como activos firmados por un usuario.
   * **Nota:** No incluye la verificación de hash para optimizar la carga de listados.
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
   * Crea un registro de un contrato que ya ha sido firmado digitalmente,
   * generalmente un contrato único generado para la firma.
   * @param {object} uniqueData - Los datos del contrato firmado (URL, Hash, Firma, id_usuario, etc.).
   * @returns {Promise<Contrato>} El nuevo registro de contrato firmado con la fecha de firma automática.
   */
  async createSignedContract(uniqueData) {
    return Contrato.create({
      ...uniqueData,
      // Asigna la fecha de firma en el momento de la creación del registro.
      fecha_firma: new Date(),
    });
  },

  /**
   * Actualiza los campos de un contrato existente por ID.
   * **Importante:** Utiliza `findById` internamente, lo que asegura que
   * se realiza la verificación de integridad antes de la actualización.
   * @param {number} id - ID del contrato a actualizar.
   * @param {object} data - Datos a actualizar.
   * @returns {Promise<Contrato|null>} El contrato actualizado o `null` si no se encuentra.
   */
  async update(id, data) {
    const contrato = await this.findById(id);
    if (!contrato) {
      return null;
    }
    return contrato.update(data);
  },

  /**
   * Realiza una **eliminación lógica** (soft delete) marcando el campo `activo` como `false`.
   * @param {number} id - ID del contrato.
   * @returns {Promise<Contrato|null>} El contrato marcado como inactivo o `null` si no se encuentra.
   */
  async softDelete(id) {
    const contrato = await Contrato.findByPk(id);
    if (!contrato) {
      return null;
    }
    // Actualiza el estado a inactivo
    return contrato.update({ activo: false });
  },

  /**
   * Obtiene la lista de todos los contratos, incluyendo los inactivos.
   * @returns {Promise<Contrato[]>} Lista completa de contratos.
   */
  async findAll() {
    return Contrato.findAll();
  },

  /**
   * Obtiene la lista de todos los contratos activos.
   * @returns {Promise<Contrato[]>} Lista de contratos donde `activo` es `true`.
   */
  async findAllActivo() {
    return Contrato.findAll({
      where: {
        activo: true,
      },
    });
  },

  /**
   * Registra la firma en un contrato base (que actúa como plantilla).
   * Actualiza el registro con datos de la firma y retorna el objeto actualizado con verificación de integridad.
   * @param {number} id_contrato_base - El ID del contrato plantilla a actualizar.
   * @param {object} signatureData - Los datos de la firma (e.g., URL del archivo firmado, hash final, estado, etc.).
   * @returns {Promise<Contrato>} El contrato actualizado.
   * @throws {Error} Si el contrato base no se encuentra o la actualización falla.
   */
  async registerSignature(id_contrato_base, signatureData) {
    try {
      // 1. Actualiza el registro del contrato base.
      const [rowsAffected] = await Contrato.update(signatureData, {
        where: { id: id_contrato_base },
        returning: true, // Intenta obtener los datos actualizados (depende del motor DB).
      });

      if (rowsAffected === 0) {
        throw new Error(
          `No se pudo encontrar o actualizar el contrato base con ID ${id_contrato_base}.`,
        );
      }

      // 2. Retorna el registro actualizado, usando findById para incluir la verificación de integridad
      // y confirmar que el archivo firmado generado no ha sido alterado.
      return this.findById(id_contrato_base);
    } catch (error) {
      console.error("Error en registerSignature del servicio:", error);
      // Relanza una excepción con un mensaje de error claro.
      throw new Error(`Fallo en el registro de la firma: ${error.message}`);
    }
  },
};

module.exports = contratoService;
