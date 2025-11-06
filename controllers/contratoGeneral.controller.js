const contratoGeneralService = require("../services/contratoGeneral.service");
const { formatErrorResponse } = require("../utils/responseUtils");
const path = require("path"); // Módulo nativo para trabajar con rutas de archivos
const fs = require("fs"); // Módulo nativo para verificar la existencia de archivos

// Asume que la ruta base de archivos subidos está configurada en algún lugar.
// CRÍTICO: Asegúrate de que esta variable sea la misma que usa tu servidor estático.
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

/**
 * Controlador para la gestión general de Contratos Firmados (listados y descarga segura).
 */
const contratoGeneralController = {
  // ----------------------------------------------------
  // 1. FUNCIONES DE LISTADO Y VISTA DE DETALLE
  // ----------------------------------------------------

  /**
   * @route GET /api/contratos/
   * @description Obtiene todos los contratos firmados (Solo Admin).
   */
  async findAllSigned(req, res) {
    try {
      const contratos = await contratoGeneralService.findAll();
      return res.status(200).json(contratos);
    } catch (error) {
      console.error("Error al listar todos los contratos:", error);
      return res
        .status(500)
        .json(
          formatErrorResponse("Fallo interno al listar todos los contratos.")
        );
    }
  },

  /**
   * @route GET /api/contratos/mis_contratos
   * @description Obtiene los contratos firmados asociados al usuario logueado.
   */
  async findMyContracts(req, res) {
    try {
      // id_usuario se obtiene del token JWT (middleware de autenticación)
      const id_usuario = req.user.id;
      const contratos = await contratoGeneralService.findByUserId(id_usuario);
      return res.status(200).json(contratos);
    } catch (error) {
      console.error("Error al listar contratos del usuario:", error);
      return res
        .status(500)
        .json(formatErrorResponse("Fallo interno al listar tus contratos."));
    }
  },

  /**
   * @route GET /api/contratos/:id
   * @description Obtiene un registro de ContratoFirmado específico por ID.
   */
  async findById(req, res) {
    try {
      const { id } = req.params;

      const contrato = await contratoGeneralService.findByPk(parseInt(id));

      if (!contrato) {
        return res
          .status(404)
          .json({ message: "Contrato firmado no encontrado." });
      }

      // Opcional: Si se requiere que solo el admin o el usuario asociado vea los metadatos.
       if (!req.user.isAdmin && contrato.id_usuario !== req.user.id) {
         return res.status(403).json({ message: "No tienes permiso para ver los detalles de este contrato." });
       }

      return res.status(200).json(contrato);
    } catch (error) {
      console.error("Error al obtener contrato por ID:", error);
      return res
        .status(500)
        .json(
          formatErrorResponse(
            "Fallo interno al obtener el detalle del contrato."
          )
        );
    }
  },

  // ----------------------------------------------------
  // 2. FUNCIÓN DE DESCARGA SEGURA (CRÍTICA)
  // ----------------------------------------------------

  /**
   * @route GET /api/contratos/descargar/:idContratoFirmado
   * @description Descarga segura del archivo PDF asociado al contrato.
   * La seguridad se aplica verificando permisos antes de exponer el archivo.
   */
  async download(req, res) {
    const { idContratoFirmado } = req.params;
    const id_usuario = req.user.id;
    const isAdmin = req.user.isAdmin; // Asumimos que esta propiedad existe en req.user

    try {
      // 1. Verificar existencia y permisos a través del servicio
      const contrato = await contratoGeneralService.getContractForDownload(
        parseInt(idContratoFirmado),
        id_usuario,
        isAdmin
      );

      if (!contrato) {
        // Devuelve 404 si no existe, o 403 si existe pero no tiene permisos (el servicio devuelve null en ambos casos si falla la cláusula where)
        return res.status(403).json({
          message:
            "Acceso denegado o contrato no encontrado. No tienes permiso para descargar este archivo.",
        });
      }

      // 2. Construir la ruta absoluta del archivo
      // contrato.url_archivo contiene la ruta relativa (ej. 'contratos_firmados/345-pdf-signed.pdf')
      const relativePath = contrato.url_archivo;
      const absolutePath = path.join(UPLOAD_DIR, relativePath);

      // 3. Verificación adicional: Asegurar que el archivo exista en el disco
      if (!fs.existsSync(absolutePath)) {
        console.error(
          `Archivo no encontrado en la ruta física: ${absolutePath}`
        );
        // Esto indica una inconsistencia DB/Disk
        return res.status(500).json({
          message:
            "Error de integridad: El archivo del contrato no se encontró en el servidor.",
        });
      }

      // 4. Descarga Segura
      // El método res.download() establece los headers Content-Disposition
      // y Content-Type automáticamente y envía el archivo.
      res.download(absolutePath, `${contrato.nombre_archivo}.pdf`, (err) => {
        if (err) {
          // Manejo de errores de transmisión o de Express (ej. el archivo no se pudo leer)
          console.error(
            `Error durante la descarga de ${idContratoFirmado}:`,
            err
          );

          // CRÍTICO: Comprobamos si los headers ya fueron enviados para evitar un error de "Can't set headers after they are sent"
          if (!res.headersSent) {
            return res
              .status(500)
              .json(
                formatErrorResponse(
                  "Fallo al procesar la descarga del archivo."
                )
              );
          }
        }
      });
    } catch (error) {
      console.error("Fallo inesperado en la función de descarga:", error);
      return res
        .status(500)
        .json(
          formatErrorResponse(
            "Fallo interno del servidor al intentar la descarga."
          )
        );
    }
  },
};

module.exports = contratoGeneralController;
