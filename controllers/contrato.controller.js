// Importaciones requeridas
const contratoService = require("../services/contrato.service");
const Inversion = require("../models/inversion"); // Usado para verificación de autorización
const Suscripcion = require("../models/suscripcion_proyecto"); // Usado para verificación de autorización
const fs = require("fs").promises; // Necesario para limpiar archivos (fs.unlink)
const path = require("path"); // Necesario para gestionar rutas de archivos

// --- IMPORTACIÓN DE LA FUNCIÓN CENTRALIZADA ---
// Asume que generateFileHash lee el archivo físico y devuelve un hash SHA256 o similar
const { generateFileHash } = require("../utils/generateFileHash");

/**
 * Controlador de Express para gestionar el ciclo de vida de los Contratos.
 * Incluye subida de plantillas, firma digital con verificación de integridad y descarga segura.
 */
const contratoController = {
  // ===================================================================
  // 📄 GESTIÓN DE LA PLANTILLA/CONTRATO BASE (Admin)
  // ===================================================================

  /**
   * @async
   * @function upload
   * @description Sube un archivo PDF (plantilla de contrato) y crea el registro en la BD.
   * Restringido solo para administradores. Calcula el hash del archivo original.
   * @param {object} req - Objeto de solicitud de Express (con `req.file` de Multer y `id_proyecto` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async upload(req, res) {
    // La subida del archivo ya ocurrió si llegamos aquí (gracias al middleware de Multer)
    try {
      // 1. Verificación de rol para subir plantillas
      if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({
          error:
            "Acceso denegado. Solo administradores pueden subir contratos base.",
        });
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ error: "No se ha subido ningún archivo." });
      }

      const { id_proyecto } = req.body;
      const url_archivo = `/uploads/${req.file.filename}`;

      // CORRECCIÓN CLAVE: Usamos la RUTA FÍSICA (req.file.path) para el cálculo del hash
      const hash_archivo_original = await generateFileHash(req.file.path);

      const fileData = {
        nombre_archivo: req.file.originalname,
        url_archivo: url_archivo, // URL pública de la plantilla
        id_proyecto: id_proyecto,
        hash_archivo_original: hash_archivo_original, // Hash de seguridad
      };

      const nuevoContrato = await contratoService.create(fileData);
      res.status(201).json(nuevoContrato);
    } catch (error) {
      // Si el registro falla, eliminamos el archivo subido para evitar basura en el servidor
      if (req.file)
        await fs
          .unlink(req.file.path)
          .catch(() =>
            console.error("Fallo al limpiar archivo:", req.file.path)
          );
      res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================
  // ✍️ PROCESO DE FIRMA DIGITAL
  // ===================================================================

  /**
   * @async
   * @function sign
   * @description Registra la firma de un usuario en un contrato base.
   * Incluye autorización rigurosa y cálculo de hash del documento firmado.
   * @param {object} req - Objeto de solicitud de Express (con `req.file` del documento firmado y metadatos en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async sign(req, res) {
    try {
      // --- 1. VERIFICACIÓN DEL ARCHIVO SUBIDO POR MULTER ---
      if (!req.file) {
        return res
          .status(400)
          .json({ error: "No se ha subido el archivo firmado." });
      }

      // --- 2. OBTENER METADATA DEL BODY ---
      const { id_contrato_base, firma_digital, id_inversion, id_suscripcion } =
        req.body;

      if (!id_contrato_base || !firma_digital) {
        await fs.unlink(req.file.path).catch(() => {}); // Limpiamos el archivo subido si faltan datos
        return res.status(400).json({
          error:
            "Faltan datos esenciales de la firma (ID del contrato base o firma_digital).",
        });
      }

      const id_usuario_firmante = req.user.id;
      const contratoBase = await contratoService.findById(id_contrato_base);

      if (!contratoBase) {
        await fs.unlink(req.file.path).catch(() => {}); // Limpiamos el archivo subido
        return res.status(404).json({ error: "Contrato base no encontrado" });
      }

      // --- 3. LÓGICA DE AUTORIZACIÓN REFORZADA ---
      // Solo puede firmar si existe una Inversión Paga o Suscripción Activa a su nombre
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
            estado: "pagado", // Requisito de estado: debe estar pagado
          },
        });
        if (inversion) {
          autorizacionValida = true;
        }
      } else if (id_suscripcion) {
        idAutorizacion = id_suscripcion;
        tipoAutorizacion = "suscripción";
        const suscripcion = await Suscripcion.findOne({
          where: {
            id: id_suscripcion,
            id_usuario: id_usuario_firmante,
            activo: true,
            estado: "activa", // Requisito de estado: debe estar activa
          },
        });
        if (suscripcion) {
          autorizacionValida = true;
        }
      }

      if (!idAutorizacion || !autorizacionValida) {
        await fs.unlink(req.file.path).catch(() => {}); // Limpiamos si la autorización falla
        const msg = !idAutorizacion
          ? "Firma rechazada. Debe especificar la inversión o suscripción de autorización."
          : `Acceso denegado. La ${tipoAutorizacion} asociada (ID: ${idAutorizacion}) no cumple los requisitos de estado.`;
        return res.status(403).json({ error: msg });
      }
      // --- FIN LÓGICA DE AUTORIZACIÓN ---

      // --- 4. GENERAR DATOS DE SEGURIDAD EN EL BACKEND ---
      // Calculamos el hash del archivo subido *firmado*
      const url_archivo_firmado = `/uploads/${req.file.filename}`;
      const hash_documento_firmado = await generateFileHash(req.file.path);
      const nombre_archivo_firmado = req.file.originalname;

      // 5. DATOS FINALES DE LA FIRMA A REGISTRAR
      const signatureData = {
        nombre_archivo: nombre_archivo_firmado,
        url_archivo: url_archivo_firmado,
        hash_archivo_original: hash_documento_firmado, // Hash del documento firmado
        firma_digital: firma_digital, // La prueba criptográfica del cliente
        id_usuario_firmante: id_usuario_firmante,
        estado_firma: "FIRMADO",
        fecha_firma: new Date(),
        id_inversion_asociada: id_inversion || null,
        id_suscripcion_asociada: id_suscripcion || null,
      };

      // 6. REGISTRAR LA FIRMA (Actualizar el contrato base, que se convierte en el contrato firmado)
      const contratoActualizado = await contratoService.registerSignature(
        id_contrato_base,
        signatureData
      );

      res.status(200).json(contratoActualizado);
    } catch (error) {
      console.error("Error al firmar contrato:", error.message);
      // Limpiamos el archivo subido si hay un error en el proceso de firma o registro
      if (req.file)
        await fs
          .unlink(req.file.path)
          .catch(() =>
            console.error(
              "Fallo al limpiar archivo tras error de firma:",
              req.file.path
            )
          );
      res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================
  // 🔍 CONSULTAS CON AUTORIZACIÓN Y VERIFICACIÓN DE INTEGRIDAD
  // ===================================================================

  /**
   * @async
   * @function findMyContracts
   * @description Obtiene todos los contratos donde el usuario autenticado es el firmante.
   * @param {object} req - Objeto de solicitud de Express (con `req.user.id`).
   * @param {object} res - Objeto de respuesta de Express.
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
   * @async
   * @function findById
   * @description Obtiene un contrato por ID. Incluye verificación de integridad del archivo
   * y verificación de permisos de lectura (firmante, inversionista/suscriptor, admin).
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params` y `req.user.id`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // El servicio debe encargarse de calcular el hash y verificar integridad
      const contrato = await contratoService.findById(id);

      if (!contrato) {
        return res.status(404).json({ error: "Contrato no encontrado." });
      }

      // 1. Verificación de Integridad (asumiendo que el servicio ya adjuntó `integrity_compromised`)
      if (contrato.dataValues.integrity_compromised) {
        return res.status(409).json({
          error:
            "El archivo ha sido alterado y su integridad está comprometida.",
        });
      }

      // 2. VERIFICACIÓN DE AUTORIZACIÓN DE LECTURA
      const tieneInversion = await Inversion.findOne({
        where: {
          id_usuario: userId,
          id_proyecto: contrato.id_proyecto,
        },
      });

      const tieneSuscripcion = await Suscripcion.findOne({
        where: {
          id_usuario: userId,
          id_proyecto: contrato.id_proyecto,
        },
      });

      const esFirmante = contrato.id_usuario_firmante === userId;
      const isAdmin = req.user && req.user.role === "admin";

      if (!esFirmante && !tieneInversion && !tieneSuscripcion && !isAdmin) {
        return res.status(403).json({
          error: "Acceso denegado. No tienes permiso para ver este contrato.",
        });
      }

      // 3. PREPARACIÓN DE LA RESPUESTA
      const contratoData = contrato.get({ plain: true });
      // Ocultamos datos sensibles de seguridad antes de enviarlos al cliente
      delete contratoData.firma_digital;
      delete contratoData.hash_archivo_original;
      delete contratoData.integrity_compromised; // Ya validado

      res.status(200).json(contratoData);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function download
   * @description Controla la descarga segura del archivo de contrato, previa verificación de permisos e integridad.
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params` y `req.user.id`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async download(req, res) {
    const { id } = req.params;
    const userId = req.user.id;

    try {
      // Usa findById que también verifica la integridad del archivo
      const contrato = await contratoService.findById(id);

      if (!contrato || !contrato.url_archivo) {
        return res
          .status(404)
          .json({ error: "Contrato o archivo no encontrado." });
      }

      // 1. Verificación de Integridad
      if (contrato.dataValues.integrity_compromised) {
        return res.status(409).json({
          error:
            "El archivo ha sido alterado y su integridad está comprometida. No se permite la descarga.",
        });
      }

      // 2. VERIFICACIÓN DE AUTORIZACIÓN DE DESCARGA (misma lógica que findById)
      const inversion = await Inversion.findOne({
        where: { id_usuario: userId, id_proyecto: contrato.id_proyecto },
      });
      const suscripcion = await Suscripcion.findOne({
        where: { id_usuario: userId, id_proyecto: contrato.id_proyecto },
      });

      const esFirmante = contrato.id_usuario_firmante === userId;
      const isAdmin = req.user && req.user.role === "admin";

      if (!esFirmante && !inversion && !suscripcion && !isAdmin) {
        return res.status(403).json({
          error:
            "Acceso denegado. No tienes permiso para descargar este contrato.",
        });
      }

      // 3. CONSTRUCCIÓN DE LA RUTA FÍSICA
      const fileName = path.basename(contrato.url_archivo);
      // Asume que 'uploads' está en el directorio raíz de la aplicación (process.cwd())
      const fullPath = path.join(process.cwd(), "uploads", fileName);

      // 4. ENVÍO SEGURO DEL ARCHIVO USANDO res.download()
      res.download(fullPath, contrato.nombre_archivo, (err) => {
        if (err) {
          console.error("Error al enviar el archivo de descarga:", err);
          if (res.headersSent) return;
          return res
            .status(500)
            .json({ error: "No se pudo procesar la descarga del archivo." });
        }
      });
    } catch (error) {
      console.error("Error en el controlador de descarga:", error);
      res.status(500).json({ error: "Error interno del servidor." });
    }
  },

  // ===================================================================
  // ⚙️ GESTIÓN ADMINISTRATIVA (Admin)
  // ===================================================================

  /**
   * @async
   * @function findAll
   * @description Obtiene todos los contratos (solo para administradores).
   */
  async findAll(req, res) {
    try {
      const contratos = await contratoService.findAll();
      res.status(200).json(contratos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todos los contratos activos (para administradores o consultas generales).
   */
  async findAllActivo(req, res) {
    try {
      const contratos = await contratoService.findAllActivo();
      res.status(200).json(contratos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function softDelete
   * @description Elimina lógicamente un contrato.
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
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
