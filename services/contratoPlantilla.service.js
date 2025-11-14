// services/contratoPlantillaService.js

const ContratoPlantilla = require("../models/ContratoPlantilla");
const localFileStorageService = require("./localFileStorage.service"); // Servicio de almacenamiento y gestión de archivos

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
    // Asegura que el estado inicial sea activo para que la plantilla pueda ser utilizada o asignada.
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

    // Solo procede con la verificación si la plantilla existe y tiene un hash de referencia.
    if (!plantilla || !plantilla.hash_archivo_original) {
      return plantilla;
    }

    // --- Lógica de Verificación de Integridad Criptográfica ---
    try {
      // 1. Calcula el hash actual del archivo físico.
      const hashActual = await localFileStorageService.calculateHashFromFile(
        plantilla.url_archivo
      );

      // 2. Compara el hash calculado con el hash guardado en la DB.
      if (hashActual !== plantilla.hash_archivo_original) {
        console.warn(
          `🚨 ALERTA DE INTEGRIDAD: Plantilla ID ${plantilla.id} manipulada. Hash esperado: ${plantilla.hash_archivo_original}, Hash actual: ${hashActual}`
        );
        // Marca si se detecta alteración.
        plantilla.dataValues.integrity_compromised = true;
      } else {
        // Marca si la integridad es correcta.
        plantilla.dataValues.integrity_compromised = false;
      }
    } catch (error) {
      // Marca como comprometido si el archivo físico no es accesible/leíble.
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
        id_proyecto: null, // Busca registros donde la asociación de proyecto es NULL
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
    return this.findByProjectId(id_proyecto); // Reutiliza la función principal
  },

  // ----------------------------------------------------
  // 3. FUNCIONES DE MUTACIÓN (ACTUALIZACIÓN Y BORRADO LÓGICO)
  // ----------------------------------------------------

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

    // 1. Genera el nuevo Hash CRIPTOGRÁFICO desde el Buffer (asegura la integridad del nuevo archivo).
    const newHash =
      localFileStorageService.calculateHashFromBuffer(newPdfBuffer);

    // 2. Sube el nuevo archivo, sobrescribiendo o guardando en la nueva ubicación.
    const newUrl = await localFileStorageService.uploadBuffer(
      newPdfBuffer,
      relativePath
    );

    // 3. Actualiza la base de datos con la nueva URL y el nuevo HASH.
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
   * Realiza un **borrado lógico (soft delete)** de una plantilla marcándola como inactiva.
   * @param {number} id - ID de la plantilla a borrar lógicamente.
   * @returns {Promise<boolean>} Retorna `true` si la plantilla fue marcada como inactiva.
   * @throws {Error} Si la plantilla ya está inactiva o no existe.
   */
  async softDelete(id) {
    // Solo intenta actualizar si la plantilla está activa para evitar borrados redundantes.
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
