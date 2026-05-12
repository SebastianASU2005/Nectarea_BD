// controllers/contrato.controller.js
const contratoService = require("../services/contrato.service");
const Inversion = require("../models/inversion");
const Suscripcion = require("../models/suscripcion_proyecto");
const storageService = require("../services/storage"); // ✅ nuevo servicio de almacenamiento

/**
 * Controlador de Express para gestionar el ciclo de vida de los Contratos.
 * Todas las operaciones de archivos usan storageService.
 */
const contratoController = {
  // ===================================================================
  // 📄 GESTIÓN DE LA PLANTILLA/CONTRATO BASE (Admin)
  // ===================================================================

  /**
   * @route POST /api/contratos/upload
   * @description Sube una plantilla de contrato (PDF) y crea el registro.
   * Usa storageService.saveFile en lugar de guardar en disco manualmente.
   */
  async upload(req, res) {
    let relativePath = null;
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ error: "No se ha subido ningún archivo." });
      }

      const { id_proyecto } = req.body;

      // Generar nombre único y ruta relativa
      const fileName = `plantilla_${Date.now()}_${req.file.originalname}`;
      relativePath = `contratos/plantillas/${fileName}`;

      // Guardar el buffer usando storageService
      const url_archivo = await storageService.saveFile(
        req.file.buffer,
        relativePath,
      );
      const hash_archivo_original = storageService.calculateHashFromBuffer(
        req.file.buffer,
      );

      const fileData = {
        nombre_archivo: req.file.originalname,
        url_archivo, // ruta relativa devuelta por saveFile
        id_proyecto: id_proyecto || null,
        hash_archivo_original,
      };

      const nuevoContrato = await contratoService.create(fileData);
      res.status(201).json(nuevoContrato);
    } catch (error) {
      // Si falla el registro, eliminar el archivo ya subido (si existe)
      if (relativePath) {
        await storageService.deleteFile(relativePath).catch(() => {});
      }
      res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================
  // ✍️ PROCESO DE FIRMA DIGITAL
  // ===================================================================

  /**
   * @route POST /api/contratos/sign
   * @description Registra la firma de un usuario en un contrato base.
   */
  async sign(req, res) {
    let relativePath = null;
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ error: "No se ha subido el archivo firmado." });
      }

      const { id_contrato_base, firma_digital, id_inversion, id_suscripcion } =
        req.body;
      if (!id_contrato_base || !firma_digital) {
        return res
          .status(400)
          .json({ error: "Faltan datos esenciales de la firma." });
      }

      const id_usuario_firmante = req.user.id;
      const contratoBase = await contratoService.findById(id_contrato_base);
      if (!contratoBase) {
        return res.status(404).json({ error: "Contrato base no encontrado" });
      }

      // --- 3. LÓGICA DE AUTORIZACIÓN (sin cambios) ---
      let autorizacionValida = false;
      let tipoAutorizacion = null;
      let idAutorizacion = null;

      if (id_inversion) {
        idAutorizacion = id_inversion;
        tipoAutorizacion = "inversión";
        const inversion = await Inversion.findOne({
          where: {
            id: id_inversion,
            id_usuario: id_usuario_firmante,
            activo: true,
            estado: "pagado",
          },
        });
        if (inversion) autorizacionValida = true;
      } else if (id_suscripcion) {
        idAutorizacion = id_suscripcion;
        tipoAutorizacion = "suscripción";
        const suscripcion = await Suscripcion.findOne({
          where: {
            id: id_suscripcion,
            id_usuario: id_usuario_firmante,
            activo: true,
            estado: "activa",
          },
        });
        if (suscripcion) autorizacionValida = true;
      }

      if (!idAutorizacion || !autorizacionValida) {
        const msg = !idAutorizacion
          ? "Firma rechazada. Debe especificar la inversión o suscripción de autorización."
          : `Acceso denegado. La ${tipoAutorizacion} asociada (ID: ${idAutorizacion}) no cumple los requisitos de estado.`;
        return res.status(403).json({ error: msg });
      }

      // --- 4. Guardar el archivo firmado con storageService ---
      const fileName = `firmado_${Date.now()}_${req.file.originalname}`;
      relativePath = `contratos/firmados/${id_contrato_base}/${fileName}`;
      const url_archivo_firmado = await storageService.saveFile(
        req.file.buffer,
        relativePath,
      );
      const hash_documento_firmado = storageService.calculateHashFromBuffer(
        req.file.buffer,
      );

      const signatureData = {
        nombre_archivo: req.file.originalname,
        url_archivo: url_archivo_firmado,
        hash_archivo_original: hash_documento_firmado,
        firma_digital: firma_digital,
        id_usuario_firmante: id_usuario_firmante,
        estado_firma: "FIRMADO",
        fecha_firma: new Date(),
        id_inversion_asociada: id_inversion || null,
        id_suscripcion_asociada: id_suscripcion || null,
      };

      const contratoActualizado = await contratoService.registerSignature(
        id_contrato_base,
        signatureData,
      );
      res.status(200).json(contratoActualizado);
    } catch (error) {
      // Limpiar archivo subido en caso de error
      if (relativePath) {
        await storageService.deleteFile(relativePath).catch(() => {});
      }
      res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================
  // 🔍 CONSULTAS CON AUTORIZACIÓN Y VERIFICACIÓN DE INTEGRIDAD
  // ===================================================================

  /**
   * @route GET /api/contratos/mis_contratos
   * @description Obtiene todos los contratos donde el usuario autenticado es firmante.
   */
  async findMyContracts(req, res) {
    try {
      const userId = req.user.id;
      const contratos = await contratoService.findByUserId(userId);
      res.status(200).json(contratos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @route GET /api/contratos/:id
   * @description Obtiene un contrato por ID (con verificación de integridad y permisos).
   */
  async findById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const contrato = await contratoService.findById(id);

      if (!contrato) {
        return res.status(404).json({ error: "Contrato no encontrado." });
      }

      if (contrato.dataValues.integrity_compromised) {
        return res.status(409).json({
          error:
            "El archivo ha sido alterado y su integridad está comprometida.",
        });
      }

      const tieneInversion = await Inversion.findOne({
        where: { id_usuario: userId, id_proyecto: contrato.id_proyecto },
      });
      const tieneSuscripcion = await Suscripcion.findOne({
        where: { id_usuario: userId, id_proyecto: contrato.id_proyecto },
      });
      const esFirmante = contrato.id_usuario_firmante === userId;
      const isAdmin = req.user && req.user.role === "admin";

      if (!esFirmante && !tieneInversion && !tieneSuscripcion && !isAdmin) {
        return res
          .status(403)
          .json({
            error: "Acceso denegado. No tienes permiso para ver este contrato.",
          });
      }

      const contratoData = contrato.get({ plain: true });
      delete contratoData.firma_digital;
      delete contratoData.hash_archivo_original;
      delete contratoData.integrity_compromised;

      res.status(200).json(contratoData);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @route GET /api/contratos/download/:id
   * @description Descarga segura del archivo de contrato usando stream desde storageService.
   */
  async download(req, res) {
    const { id } = req.params;
    const userId = req.user.id;

    try {
      const contrato = await contratoService.findById(id);
      if (!contrato || !contrato.url_archivo) {
        return res
          .status(404)
          .json({ error: "Contrato o archivo no encontrado." });
      }

      if (contrato.dataValues.integrity_compromised) {
        return res.status(409).json({
          error:
            "El archivo ha sido alterado y su integridad está comprometida. No se permite la descarga.",
        });
      }

      const inversion = await Inversion.findOne({
        where: { id_usuario: userId, id_proyecto: contrato.id_proyecto },
      });
      const suscripcion = await Suscripcion.findOne({
        where: { id_usuario: userId, id_proyecto: contrato.id_proyecto },
      });
      const esFirmante = contrato.id_usuario_firmante === userId;
      const isAdmin = req.user && req.user.role === "admin";

      if (!esFirmante && !inversion && !suscripcion && !isAdmin) {
        return res
          .status(403)
          .json({
            error:
              "Acceso denegado. No tienes permiso para descargar este contrato.",
          });
      }

      // Obtener stream del archivo mediante storageService
      const fileStream = await storageService.getFileStream(
        contrato.url_archivo,
      );
      if (!fileStream) {
        return res
          .status(500)
          .json({
            error: "El archivo no existe físicamente en el almacenamiento.",
          });
      }

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${contrato.nombre_archivo}"`,
      );
      res.setHeader("Content-Type", "application/pdf");
      fileStream.pipe(res);
    } catch (error) {
      console.error("Error en descarga:", error);
      res.status(500).json({ error: "Error interno del servidor." });
    }
  },

  // ===================================================================
  // ⚙️ GESTIÓN ADMINISTRATIVA (Admin)
  // ===================================================================

  async findAll(req, res) {
    try {
      const contratos = await contratoService.findAll();
      res.status(200).json(contratos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAllActivo(req, res) {
    try {
      const contratos = await contratoService.findAllActivo();
      res.status(200).json(contratos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @route DELETE /api/contratos/:id
   * @description Borrado lógico de un contrato (no elimina el archivo físico).
   */
  async softDelete(req, res) {
    try {
      const contratoEliminado = await contratoService.softDelete(req.params.id);
      if (!contratoEliminado) {
        return res.status(404).json({ error: "Contrato no encontrado" });
      }
      res.status(200).json({ message: "Contrato eliminado correctamente." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = contratoController;
