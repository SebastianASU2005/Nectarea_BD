// services/contratoPlantillaService.js

const ContratoPlantilla = require("../models/ContratoPlantilla");
const localFileStorageService = require("./localFileStorage.service");

/**
 * Servicio de lógica de negocio para la gestión de Contratos Plantilla.
 * Se enfoca en el ciclo de vida de las plantillas base, su asignación a proyectos
 * y la **verificación criptográfica de su integridad**.
 */
const contratoPlantillaService = {
  /**
   * Crea un nuevo registro de Plantilla de Contrato.
   * La plantilla se marca automáticamente como **activa** en su creación.
   * @param {object} data - Datos de la plantilla, incluyendo `url_archivo` y `hash_archivo_original`.
   * @returns {Promise<ContratoPlantilla>} La plantilla creada.
   */
  async create(data) {
    data.activo = true;
    return ContratoPlantilla.create(data);
  },

  // ----------------------------------------------------
  // 1. FUNCIONES DE LECTURA CON VERIFICACIÓN DE INTEGRIDAD
  // ----------------------------------------------------

  /**
   * Busca una plantilla por ID de Proyecto y número de Versión, y verifica su integridad.
   * @param {number} id_proyecto - ID del proyecto al que está asociada la plantilla.
   * @param {number} version - Número de versión de la plantilla.
   * @returns {Promise<ContratoPlantilla|null>} La plantilla, con el campo `integrity_compromised` añadido (booleano).
   */
  async findByProyectoAndVersion(id_proyecto, version) {
    const plantilla = await ContratoPlantilla.findOne({
      where: { id_proyecto, version, activo: true },
    });

    if (!plantilla || !plantilla.hash_archivo_original) {
      return plantilla;
    }

    try {
      const hashActual = await localFileStorageService.calculateHashFromFile(
        plantilla.url_archivo
      );

      if (hashActual !== plantilla.hash_archivo_original) {
        console.warn(
          `🚨 ALERTA DE INTEGRIDAD: Plantilla ID ${plantilla.id} manipulada. Hash esperado: ${plantilla.hash_archivo_original}, Hash actual: ${hashActual}`
        );
        plantilla.dataValues.integrity_compromised = true;
      } else {
        plantilla.dataValues.integrity_compromised = false;
      }
    } catch (error) {
      console.error(
        `Error al verificar integridad del archivo plantilla ${plantilla.id} (Archivo físico no encontrado/leíble):`,
        error.message
      );
      plantilla.dataValues.integrity_compromised = true;
    }

    return plantilla;
  },

  // ----------------------------------------------------
  // 2. FUNCIONES DE LECTURA GENERAL
  // ----------------------------------------------------

  /**
   * Obtiene **TODOS** los registros de plantillas (incluyendo las inactivas).
   * @returns {Promise<ContratoPlantilla[]>} Lista completa de plantillas.
   */
  async findAll() {
    return ContratoPlantilla.findAll({
      order: [["id", "DESC"]],
    });
  },

  /**
   * Obtiene todas las plantillas que están actualmente activas.
   * @returns {Promise<ContratoPlantilla[]>} Lista de plantillas activas.
   */
  async findAllActivo() {
    return ContratoPlantilla.findAll({
      where: { activo: true },
      order: [["id", "DESC"]],
    });
  },

  /**
   * Obtiene todas las plantillas activas que **NO están asignadas a ningún proyecto** (libres para ser asociadas).
   * @returns {Promise<ContratoPlantilla[]>} Lista de plantillas sin proyecto.
   */
  async findUnassociated() {
    return ContratoPlantilla.findAll({
      where: {
        id_proyecto: null,
        activo: true,
      },
      order: [["id", "DESC"]],
    });
  },

  /**
   * Obtiene todas las plantillas activas asignadas a un proyecto específico.
   * @param {number} id_proyecto - ID del proyecto.
   * @returns {Promise<ContratoPlantilla[]>} Lista de plantillas activas del proyecto, ordenadas por versión.
   */
  async findByProjectId(id_proyecto) {
    return ContratoPlantilla.findAll({
      where: {
        id_proyecto,
        activo: true,
      },
      order: [["version", "DESC"]],
    });
  },

  /**
   * Alias de `findByProjectId` para obtener todas las versiones activas de plantillas para un proyecto.
   * @param {number} id_proyecto - ID del proyecto.
   * @returns {Promise<ContratoPlantilla[]>} Lista de plantillas activas del proyecto.
   */
  async findAllActivoByProyecto(id_proyecto) {
    return this.findByProjectId(id_proyecto);
  },

  // ----------------------------------------------------
  // 3. FUNCIONES DE MUTACIÓN (ACTUALIZACIÓN Y BORRADO LÓGICO)
  // ----------------------------------------------------

  /**
   * 🆕 Actualiza los datos de una plantilla (nombre, proyecto asignado, versión, etc.)
   * NO modifica el archivo PDF ni el hash.
   * @param {number} id - ID de la plantilla a actualizar.
   * @param {object} updateData - Objeto con los campos a actualizar.
   * @returns {Promise<ContratoPlantilla>} La plantilla actualizada.
   * @throws {Error} Si la plantilla no existe.
   */
  async updatePlantillaData(id, updateData) {
    const plantilla = await ContratoPlantilla.findByPk(id);

    if (!plantilla) {
      throw new Error(`Plantilla con ID ${id} no encontrada.`);
    }

    // Campos permitidos para actualizar
    const allowedFields = ["nombre_archivo", "id_proyecto", "version"];

    // Filtra solo los campos permitidos que vengan en updateData
    const dataToUpdate = {};
    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        dataToUpdate[field] = updateData[field];
      }
    });

    // Si se está asignando a un proyecto, validar que no exista otra plantilla con la misma versión
    if (
      dataToUpdate.id_proyecto !== undefined &&
      dataToUpdate.id_proyecto !== null
    ) {
      const version = dataToUpdate.version || plantilla.version;
      const existingPlantilla = await ContratoPlantilla.findOne({
        where: {
          id_proyecto: dataToUpdate.id_proyecto,
          version: version,
          id: { [require("../config/database").Op.ne]: id }, // Excluir la plantilla actual
          activo: true,
        },
      });

      if (existingPlantilla) {
        throw new Error(
          `Ya existe una plantilla activa con versión ${version} para el proyecto ${dataToUpdate.id_proyecto}.`
        );
      }
    }

    dataToUpdate.fecha_actualizacion = new Date();

    const [, [updatedPlantilla]] = await ContratoPlantilla.update(
      dataToUpdate,
      {
        where: { id },
        returning: true,
      }
    );

    return updatedPlantilla;
  },

  /**
   * Actualiza el archivo PDF físico de una plantilla y recalcula/actualiza su hash criptográfico.
   * Esta operación es crítica ya que cambia la fuente de la verdad del contrato.
   * @param {number} id - ID de la plantilla a modificar.
   * @param {Buffer} newPdfBuffer - El nuevo contenido binario del archivo PDF.
   * @param {string} relativePath - La ruta relativa de almacenamiento donde se guardará el nuevo archivo.
   * @returns {Promise<ContratoPlantilla>} El registro de plantilla actualizado.
   * @throws {Error} Si la plantilla no existe.
   */
  async updatePdf(id, newPdfBuffer, relativePath) {
    const plantilla = await ContratoPlantilla.findByPk(id);

    if (!plantilla) {
      throw new Error(`Plantilla con ID ${id} no encontrada.`);
    }

    const newHash =
      localFileStorageService.calculateHashFromBuffer(newPdfBuffer);

    const newUrl = await localFileStorageService.uploadBuffer(
      newPdfBuffer,
      relativePath
    );

    const [, [updatedPlantilla]] = await ContratoPlantilla.update(
      {
        url_archivo: newUrl,
        hash_archivo_original: newHash,
        fecha_actualizacion: new Date(),
      },
      {
        where: { id },
        returning: true,
      }
    );

    return updatedPlantilla;
  },

  /**
   * 🆕 Cambia el estado activo de una plantilla (activar/desactivar).
   * @param {number} id - ID de la plantilla.
   * @param {boolean} activo - Nuevo estado (true para activar, false para desactivar).
   * @returns {Promise<ContratoPlantilla>} La plantilla actualizada.
   * @throws {Error} Si la plantilla no existe.
   */
  async toggleActive(id, activo) {
    const plantilla = await ContratoPlantilla.findByPk(id);

    if (!plantilla) {
      throw new Error(`Plantilla con ID ${id} no encontrada.`);
    }

    const [, [updatedPlantilla]] = await ContratoPlantilla.update(
      {
        activo: activo,
        fecha_actualizacion: new Date(),
      },
      {
        where: { id },
        returning: true,
      }
    );

    return updatedPlantilla;
  },

  /**
   * Realiza un **borrado lógico (soft delete)** de una plantilla marcándola como inactiva.
   * @param {number} id - ID de la plantilla a borrar lógicamente.
   * @returns {Promise<boolean>} Retorna `true` si la plantilla fue marcada como inactiva.
   * @throws {Error} Si la plantilla ya está inactiva o no existe.
   */
  async softDelete(id) {
    const [updatedCount] = await ContratoPlantilla.update(
      {
        activo: false,
      },
      {
        where: { id, activo: true },
      }
    );

    if (updatedCount === 0) {
      throw new Error(
        `No se pudo realizar el borrado lógico a la plantilla con ID ${id} (ya inactiva o no existe).`
      );
    }
    
    return true;
  },
};

module.exports = contratoPlantillaService;
