const Contrato = require("../models/contrato");
const Proyecto = require("../models/proyecto");
const Inversion = require("../models/inversion");

// --- CAMBIOS CLAVE AQUÍ ---
// 1. Eliminamos las importaciones de fs, path y crypto.
// 2. Importamos la función de utilidad centralizada.
const { generateFileHash } = require("../utils/generateFileHash");
// --- FIN DE CAMBIOS CLAVE ---

// Se elimina la función auxiliar generateFileHash, ya está en utils/crypto.utils.js

const contratoService = {
  // Crea un nuevo registro de contrato (se usa para subir el base o para crear el firmado único)
  async create(data) {
    // 'data' ahora debe incluir el campo 'hash_archivo_original'
    return Contrato.create(data);
  }, 

  // Método central para verificar la integridad del contrato al ser consultado
  async findAndVerifyById(id) {
    const contrato = await Contrato.findByPk(id, {
      include: [{ model: Proyecto, as: "proyecto" }],
    });

    if (contrato && contrato.hash_archivo_original) {
      try {
        const hashActual = await generateFileHash(contrato.url_archivo); // Comparamos el hash que está en la DB con el hash del archivo físico
        if (hashActual !== contrato.hash_archivo_original) {
          console.warn(
            `🚨 ALERTA DE INTEGRIDAD: Contrato ID ${id} manipulado. Hash esperado: ${contrato.hash_archivo_original}, Hash actual: ${hashActual}`
          ); // Añadimos un flag para que el controlador (especialmente para administradores) pueda saber.
          contrato.dataValues.integrity_compromised = true;
        } else {
          contrato.dataValues.integrity_compromised = false;
        }
      } catch (error) {
        // Manejamos el error de la función generateFileHash (archivo no encontrado/accesible)
        console.error(
          `Error al verificar integridad del archivo ${contrato.id}:`,
          error.message
        );
        contrato.dataValues.integrity_compromised = true; // Marcar como comprometido por falla de acceso
      }
    }
    return contrato;
  }, 

  // Obtiene un contrato por su ID, incluyendo el proyecto asociado y verificando la integridad
  async findById(id) {
    // Reemplazamos el findByPk simple con la versión que verifica la integridad
    return this.findAndVerifyById(id);
  }, 

  // Obtiene los contratos firmados por un usuario específico
  async findByUserId(userId) {
    return Contrato.findAll({
      where: {
        id_usuario_firmante: userId,
        activo: true,
      }, // Nota: No verificamos el Hash aquí para no ralentizar la carga de la lista completa.
    });
  }, 

  // Crea el registro del contrato firmado (actualizado para recibir todos los datos únicos)
  async createSignedContract(uniqueData) {
    // Este método es llamado por el controlador 'sign' y espera que 'uniqueData'
    // ya contenga la URL única, el Hash único y la Firma Criptográfica.
    return Contrato.create({
      ...uniqueData,
      fecha_firma: new Date(), // Asignamos la fecha de firma automáticamente
    });
  }, 

  // Actualiza un contrato, útil para agregar la firma digital 
  // Este método ya no será la principal forma de firma (se usará createSignedContract)
  async update(id, data) {
    const contrato = await this.findById(id);
    if (!contrato) {
      return null;
    }
    return contrato.update(data);
  }, 

  // Elimina un contrato (soft delete)
  async softDelete(id) {
    const contrato = await Contrato.findByPk(id); // Usamos findByPk simple aquí
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

  /**
   * @function registerSignature
   * @description Actualiza el registro de un contrato base con los datos de la firma y el vínculo de autorización.
   * @param {number} id_contrato_base - El ID del contrato base a actualizar.
   * @param {object} signatureData - Los datos de la firma (URL, hash, estado, id_inversion_asociada, etc.).
   * @returns {Promise<object>} El contrato actualizado.
   */
  async registerSignature(id_contrato_base, signatureData) {
    try {
      // Utilizamos update para actualizar el registro del contrato base con los datos de firma.
      const [rowsAffected] = await Contrato.update(signatureData, {
        where: { id: id_contrato_base },
        returning: true, // Si usas Sequelize, esto devuelve el objeto actualizado
      });

      if (rowsAffected === 0) {
        throw new Error(
          `No se pudo encontrar o actualizar el contrato base con ID ${id_contrato_base}.`
        );
      } 
      // Buscamos y retornamos el registro actualizado. 
      // Usamos this.findById() para asegurar que el registro actualizado pase la verificación de integridad si es necesario.
      return this.findById(id_contrato_base);
    } catch (error) {
      console.error("Error en registerSignature del servicio:", error);
      throw new Error(`Fallo en el registro de la firma: ${error.message}`);
    }
  },
};

module.exports = contratoService;
