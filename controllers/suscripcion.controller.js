const suscripcionService = require('../services/suscripcion.service');

const suscripcionController = {
  // Controlador para cancelar una suscripción
  async cancel(req, res) {
    try {
      const { id } = req.params;
      // Validar que el usuario sea el dueño de la suscripción
      const suscripcion = await suscripcionService.findById(id);
      if (!suscripcion || suscripcion.id_usuario !== req.user.id) {
        return res.status(403).json({ error: 'Acceso denegado.' });
      }
      
      const suscripcionCancelada = await suscripcionService.softDelete(id);
      res.status(200).json({
        message: 'Suscripción cancelada correctamente.',
        suscripcion: suscripcionCancelada,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
};

module.exports = suscripcionController;
