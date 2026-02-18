// controllers/contratoFirma.controller.js
const contratoFirmadoService = require("../services/contratoFirmado.service");
const localFileStorageService = require("../services/localFileStorage.service");
const auth2faService = require("../services/auth2fa.service");
const UsuarioService = require("../services/usuario.service");
const { getIpAddress } = require("../utils/networkUtils");
const { formatErrorResponse } = require("../utils/responseUtils");

const contratoFirmaController = {
  async registrarFirma(req, res) {
    try {
      const {
        id_contrato_plantilla,
        id_proyecto,
        id_usuario_firmante,
        hash_archivo_firmado,
        latitud_verificacion,
        longitud_verificacion,
        codigo_2fa,
      } = req.body;

      const pdfFile = req.file;

      // ============================================================
      // FASE 1: VALIDACIONES BÁSICAS
      // ============================================================

      if (!pdfFile || !pdfFile.buffer) {
        return res.status(400).json({
          message: "No se encontró el archivo PDF en la solicitud.",
        });
      }

      if (!codigo_2fa) {
        return res.status(400).json({
          message: "El código 2FA es requerido para firmar el contrato.",
        });
      }

      // ============================================================
      // FASE 2: VERIFICACIÓN 2FA
      // ============================================================

      const user = await UsuarioService.findById(id_usuario_firmante);

      if (!user || !user.is_2fa_enabled || !user.twofa_secret) {
        return res.status(403).json({
          message:
            "Error de autenticación: El 2FA no está correctamente configurado.",
        });
      }

      const isVerified = auth2faService.verifyToken(
        user.twofa_secret,
        codigo_2fa,
      );

      if (!isVerified) {
        return res.status(401).json({
          message:
            "❌ Código 2FA incorrecto. La firma del contrato ha sido rechazada.",
        });
      }

      // ============================================================
      // FASE 3: VERIFICACIÓN DE HASH
      // ============================================================

      const hashVerificadoBackend =
        localFileStorageService.calculateHashFromBuffer(pdfFile.buffer);

      if (hashVerificadoBackend !== hash_archivo_firmado) {
        console.warn(
          `🚨 ALERTA DE HASH: Hash del front-end (${hash_archivo_firmado}) no coincide con el hash del back-end (${hashVerificadoBackend}).`,
        );
        return res.status(400).json({
          message:
            "Error de seguridad: Integridad del archivo comprometida durante la transmisión.",
        });
      }

      // ============================================================
      // FASE 4: PRE-VALIDACIÓN DE NEGOCIO (SIN GUARDAR NADA)
      // ============================================================

      await contratoFirmadoService.validateContractEligibility({
        id_usuario_firmante,
        id_proyecto,
        id_contrato_plantilla,
      });

      // ============================================================
      // FASE 5: GUARDAR PDF (SOLO SI VALIDACIONES PASARON)
      // ============================================================

      const sanitize = (str) =>
        str.replace(/[^a-zA-Z0-9_\-]/g, "_").substring(0, 40);

      const plantilla = await contratoFirmadoService.getPlantillaById(
        id_contrato_plantilla,
      );

      const nombrePlantilla = sanitize(
        plantilla.nombre_archivo.replace(/\.pdf$/i, ""),
      );
      const nombreUsuario = sanitize(`${user.nombre}_${user.apellido}`);
      const fecha = new Date().toISOString().substring(0, 10); // "2025-02-18"

      const fileName = `${nombrePlantilla}__${nombreUsuario}__${fecha}.pdf`;
      const relativeFilePath = `contratos/${id_proyecto}/${fileName}`;

      const url_archivo_final = await localFileStorageService.uploadBuffer(
        pdfFile.buffer,
        relativeFilePath,
      );

      // ============================================================
      // FASE 6: CREAR REGISTRO EN BASE DE DATOS
      // ============================================================

      const firmaData = {
        id_contrato_plantilla,
        nombre_archivo: fileName,
        url_archivo: url_archivo_final,
        hash_archivo_firmado: hashVerificadoBackend,
        firma_digital: `Firma Protocolo Propio - Usuario ID ${id_usuario_firmante} - 2FA Verificado`,
        id_proyecto,
        id_usuario_firmante,
        ip_firma: getIpAddress(req),
        geolocalizacion_firma: `${latitud_verificacion || "N/A"},${
          longitud_verificacion || "N/A"
        }`,
      };

      const contratoFirmado =
        await contratoFirmadoService.registerSignedContract(firmaData);

      return res.status(201).json({
        message:
          "✅ Contrato firmado y auditoría registrada con éxito. Firma verificada con 2FA y validaciones de negocio.",
        contrato: {
          id: contratoFirmado.id,
          nombre_archivo: contratoFirmado.nombre_archivo,
          fecha_firma: contratoFirmado.fecha_firma,
          estado_firma: contratoFirmado.estado_firma,
          url_archivo: url_archivo_final,
          tipo_autorizacion: contratoFirmado.id_inversion_asociada
            ? "inversion"
            : "suscripcion",
          id_autorizacion:
            contratoFirmado.id_inversion_asociada ||
            contratoFirmado.id_suscripcion_asociada,
        },
      });
    } catch (error) {
      console.error("Error al registrar la firma del contrato:", error);

      const statusCode = error.message.startsWith("❌") ? 400 : 500;

      return res.status(statusCode).json(formatErrorResponse(error.message));
    }
  },
};

module.exports = contratoFirmaController;
