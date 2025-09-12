const contratoService = require('../services/contrato.service');

const contratoController = {
  // Controlador para subir un archivo PDF y crear el registro en la BD
  async upload(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
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
      const { firma_digital, id_usuario_firmante } = req.body;
      const contratoActualizado = await contratoService.update(req.params.id, {
        firma_digital: firma_digital,
        id_usuario_firmante: id_usuario_firmante,
      });

      if (!contratoActualizado) {
        return res.status(404).json({ error: 'Contrato no encontrado' });
      }

      res.status(200).json(contratoActualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Controlador para obtener un contrato por su ID
  async findById(req, res) {
    try {
      const contrato = await contratoService.findById(req.params.id);
      if (!contrato) {
        return res.status(404).json({ error: 'Contrato no encontrado' });
      }
      res.status(200).json(contrato);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // **NUEVO** - Controlador para obtener todos los contratos
  async findAll(req, res) {
    try {
      const contratos = await contratoService.findAll();
      res.status(200).json(contratos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // **NUEVO** - Controlador para obtener todos los contratos activos
  async findAllActivo(req, res) {
    try {
      const contratos = await contratoService.findAllActivo();
      res.status(200).json(contratos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = contratoController;