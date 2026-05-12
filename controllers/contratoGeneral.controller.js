const contratoGeneralService = require("../services/contratoGeneral.service");
const { formatErrorResponse } = require("../utils/responseUtils");
const storageService = require("../services/storage");

const contratoGeneralController = {
  async findAllSigned(req, res) {
    try {
      const contratos = await contratoGeneralService.findAll();
      return res.status(200).json(contratos);
    } catch (error) {
      console.error("Error al listar todos los contratos:", error);
      return res
        .status(500)
        .json(
          formatErrorResponse("Fallo interno al listar todos los contratos."),
        );
    }
  },

  async findMyContracts(req, res) {
    try {
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

  async findById(req, res) {
    try {
      const { id } = req.params;
      const contrato = await contratoGeneralService.findByPk(parseInt(id));
      if (!contrato) {
        return res
          .status(404)
          .json({ message: "Contrato firmado no encontrado." });
      }
      if (!req.user.isAdmin && contrato.id_usuario !== req.user.id) {
        return res.status(403).json({
          message: "No tienes permiso para ver los detalles de este contrato.",
        });
      }
      return res.status(200).json(contrato);
    } catch (error) {
      console.error("Error al obtener contrato por ID:", error);
      return res
        .status(500)
        .json(
          formatErrorResponse(
            "Fallo interno al obtener el detalle del contrato.",
          ),
        );
    }
  },

  async download(req, res) {
    const { idContratoFirmado } = req.params;
    const id_usuario = req.user.id;
    const isAdmin = req.user.isAdmin;

    try {
      const contrato = await contratoGeneralService.getContractForDownload(
        parseInt(idContratoFirmado),
        id_usuario,
        isAdmin,
      );

      if (!contrato) {
        return res.status(403).json({
          message:
            "Acceso denegado o contrato no encontrado. No tienes permiso para descargar este archivo.",
        });
      }

      // ✅ Usar storageService para obtener el stream
      const fileStream = await storageService.getFileStream(
        contrato.url_archivo,
      );
      if (!fileStream) {
        return res.status(500).json({
          message:
            "Error de integridad: El archivo del contrato no se encontró en el almacenamiento.",
        });
      }

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${contrato.nombre_archivo}.pdf"`,
      );
      res.setHeader("Content-Type", "application/pdf");
      fileStream.pipe(res);
    } catch (error) {
      console.error("Fallo inesperado en la función de descarga:", error);
      return res
        .status(500)
        .json(
          formatErrorResponse(
            "Fallo interno del servidor al intentar la descarga.",
          ),
        );
    }
  },
};

module.exports = contratoGeneralController;
