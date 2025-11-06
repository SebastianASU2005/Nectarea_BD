// services/contratoPlantillaService.js

const ContratoPlantilla = require("../models/ContratoPlantilla");
const localFileStorageService = require("./localFileStorage.service");
// Nota: La importación se asume relativa al directorio 'services'.

/**
 * Servicio de lógica de negocio para la gestión de Contratos Plantilla.
 * Se enfoca en gestionar las plantillas base, verificar su integridad y controlar su ciclo de vida.
 */
const contratoPlantillaService = {
  /**
   * @async
   * @function create
   * @description Crea una nueva Plantilla de Contrato.
   * REGLA DE NEGOCIO: Las plantillas se crean inicialmente sin estar asociadas a un proyecto.
   * @param {object} data - Datos de la plantilla, incluyendo url_archivo y hash_archivo_original.
   * @returns {Promise<ContratoPlantilla>} La plantilla creada.
   * @throws {Error} Si la plantilla intenta crearse con un id_proyecto asignado.
   */
  async create(data) {
    // ✅ ELIMINADA la validación restrictiva anterior
    // Ahora las plantillas pueden crearse con o sin proyecto

    // Asegurar que el estado inicial sea activo
    data.activo = true;

    return ContratoPlantilla.create(data);
  },
  // ----------------------------------------------------
  // 1. FUNCIONES DE LECTURA EXISTENTES Y MEJORADAS
  // ----------------------------------------------------

  /**
   * @async
   * @function findByProyectoAndVersion
   * @description Busca una plantilla por ID de Proyecto y Versión, y verifica su integridad.
   * (Mantenida sin cambios respecto al último paso).
   */
  async findByProyectoAndVersion(id_proyecto, version) {
    const plantilla = await ContratoPlantilla.findOne({
      where: { id_proyecto, version, activo: true },
    });

    if (!plantilla || !plantilla.hash_archivo_original) {
      return plantilla;
    }

    // --- Lógica de Verificación de Integridad ---
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
  // 2. NUEVAS FUNCIONES DE LECTURA (GETs)
  // ----------------------------------------------------

  /**
   * @async
   * @function findAll
   * @description Obtiene TODOS los registros de plantillas (incluyendo borradas lógicamente).
   * @returns {Promise<ContratoPlantilla[]>} Lista de plantillas.
   */
  async findAll() {
    return ContratoPlantilla.findAll({
      order: [["id", "DESC"]],
    });
  },

  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todas las plantillas que están activas.
   * @returns {Promise<ContratoPlantilla[]>} Lista de plantillas activas.
   */
  async findAllActivo() {
    return ContratoPlantilla.findAll({
      where: { activo: true },
      order: [["id", "DESC"]],
    });
  },

  /**
   * @async
   * @function findUnassociated
   * @description Obtiene todas las plantillas activas que NO están asignadas a un proyecto.
   * @returns {Promise<ContratoPlantilla[]>} Lista de plantillas sin proyecto.
   */
  async findUnassociated() {
    return ContratoPlantilla.findAll({
      where: {
        id_proyecto: null, // Asume que un proyecto no asociado es NULL
        activo: true,
      },
      order: [["id", "DESC"]],
    });
  },

  /**
   * @async
   * @function findByProjectId
   * @description Obtiene todas las plantillas activas asignadas a un proyecto específico.
   * @param {number} id_proyecto - ID del proyecto.
   * @returns {Promise<ContratoPlantilla[]>} Lista de plantillas activas del proyecto.
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
   * @async
   * @function findAllActivoByProyecto
   * @description Obtiene todas las versiones activas de plantillas para un proyecto. (Mantenida).
   */
  async findAllActivoByProyecto(id_proyecto) {
    return this.findByProjectId(id_proyecto); // Reutiliza la nueva función
  },

  // ----------------------------------------------------
  // 3. NUEVAS FUNCIONES DE MUTACIÓN (UPDATE/DELETE)
  // ----------------------------------------------------

  /**
   * @async
   * @function updatePdf
   * @description Cambia el archivo PDF de una plantilla existente y actualiza su hash.
   * @param {number} id - ID de la plantilla a modificar.
   * @param {Buffer} newPdfBuffer - El nuevo contenido binario del PDF.
   * @param {string} relativePath - La ruta relativa para guardar el archivo (ej: 'plantillas/nueva_v2.pdf').
   * @returns {Promise<ContratoPlantilla>} El registro de plantilla actualizado.
   * @throws {Error} Si la plantilla no existe.
   */
  async updatePdf(id, newPdfBuffer, relativePath) {
    const plantilla = await ContratoPlantilla.findByPk(id);

    if (!plantilla) {
      throw new Error(`Plantilla con ID ${id} no encontrada.`);
    }

    // 1. Generar el nuevo Hash desde el Buffer
    const newHash =
      localFileStorageService.calculateHashFromBuffer(newPdfBuffer);

    // 2. Subir el nuevo archivo al disco local
    const newUrl = await localFileStorageService.uploadBuffer(
      newPdfBuffer,
      relativePath
    );

    // 3. Actualizar la DB
    const [updatedCount, [updatedPlantilla]] = await ContratoPlantilla.update(
      {
        url_archivo: newUrl,
        hash_archivo_original: newHash,
        // Opcionalmente, puedes querer aumentar la versión o marcarla como revisada.
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
   * @async
   * @function softDelete
   * @description Realiza un borrado lógico (soft delete) de una plantilla.
   * @param {number} id - ID de la plantilla a borrar.
   * @returns {Promise<boolean>} True si la plantilla fue borrada.
   */
  async softDelete(id) {
    const [updatedCount] = await ContratoPlantilla.update(
      {
        activo: false,
        // Opcional: registrar quién y cuándo se borró lógicamente
        // fecha_borrado: new Date(),
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
