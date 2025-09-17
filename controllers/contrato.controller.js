const contratoService = require("../services/contrato.service");
const Inversion = require("../models/inversion");

const contratoController = {
  // Controlador para subir un archivo PDF y crear el registro en la BD
  async upload(req, res) {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ error: "No se ha subido ningún archivo." });
      }

      const { id_proyecto } = req.body;
      const fileData = {
        nombre_archivo: req.file.originalname,
        url_archivo: `/uploads/${req.file.filename}`,
        id_proyecto: id_proyecto,
      };

      const nuevoContrato = await contratoService.create(fileData);
      res.status(201).json(nuevoContrato);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Controlador para agregar la firma digital a un contrato
  async sign(req, res) {
    try {
      const { firma_digital } = req.body;
      const id_usuario_firmante = req.user.id;
      const contratoBaseId = req.params.id;

      // 1. Obtener el contrato base
      const contratoBase = await contratoService.findById(contratoBaseId);

      if (!contratoBase) {
        return res.status(404).json({ error: "Contrato base no encontrado" });
      }

      // 2. Crear un nuevo contrato con la firma y el ID del usuario
      const nuevoContratoFirmado = await contratoService.createSignedContract(
        contratoBase,
        firma_digital,
        id_usuario_firmante
      );

      res.status(201).json(nuevoContratoFirmado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Controlador para obtener los contratos del usuario autenticado
  async findMyContracts(req, res) {
    try {
      const userId = req.user.id;
      const contratos = await contratoService.findByUserId(userId);
      res.status(200).json(contratos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para obtener un contrato por su ID
  async findById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const contrato = await contratoService.findById(id);

      if (!contrato) {
        return res.status(404).json({ error: "Contrato no encontrado." });
      }

      // Verificamos si el usuario tiene una inversión en el proyecto asociado a este contrato
      const inversion = await Inversion.findOne({
        where: {
          id_inversor: userId,
          id_proyecto: contrato.id_proyecto,
        },
      });

      // Si no hay una inversión, el acceso es denegado
      if (!inversion) {
        return res.status(403).json({ error: "Acceso denegado. No tienes permiso para ver este contrato." });
      }

      // Si la inversión existe, permitimos el acceso
      res.status(200).json(contrato);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para obtener todos los contratos
  async findAll(req, res) {
    try {
      const contratos = await contratoService.findAll();
      res.status(200).json(contratos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para obtener todos los contratos activos
  async findAllActivo(req, res) {
    try {
      const contratos = await contratoService.findAllActivo();
      res.status(200).json(contratos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para eliminar un contrato
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