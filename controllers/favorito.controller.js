// controllers/favorito.controller.js
const favoritoService = require("../services/favorito.service");

const favoritoController = {
  /**
   * @async
   * @function toggleFavorito
   * @description Agrega o elimina un lote de favoritos del usuario autenticado.
   * @param {object} req - Objeto de solicitud (con id_lote en body y usuario en req.user).
   * @param {object} res - Objeto de respuesta.
   */
  async toggleFavorito(req, res) {
    try {
      const { id_lote } = req.body;
      const idUsuario = req.user.id; // Asumiendo autenticación con JWT

      if (!id_lote) {
        return res.status(400).json({ error: "El ID del lote es requerido." });
      }

      const resultado = await favoritoService.toggleFavorito(
        idUsuario,
        id_lote
      );
      res.status(200).json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function getMisFavoritos
   * @description Obtiene los lotes favoritos activos del usuario autenticado.
   * @param {object} req - Objeto de solicitud (usuario en req.user).
   * @param {object} res - Objeto de respuesta.
   */
  async getMisFavoritos(req, res) {
    try {
      const idUsuario = req.user.id;
      const favoritos = await favoritoService.findFavoritosByUsuario(idUsuario);
      res.status(200).json(favoritos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function getEstadisticas
   * @description Obtiene estadísticas de favoritos (solo administradores) para un proyecto específico.
   * @param {object} req - Objeto de solicitud (con id_proyecto obligatorio en req.query).
   * @param {object} res - Objeto de respuesta.
   */
  async getEstadisticas(req, res) {
    try {
      const { id_proyecto } = req.query; // Obtener el parámetro de la query // ⬅️ HACER id_proyecto OBLIGATORIO

      if (!id_proyecto) {
        return res.status(400).json({
          error: "El ID del proyecto es requerido para obtener estadísticas.",
        });
      } // Convertir a entero para pasarlo al servicio

      const idProyectoInt = parseInt(id_proyecto);

      const estadisticas = await favoritoService.getEstadisticasFavoritos(
        idProyectoInt // ⬅️ Siempre pasamos el ID
      ); // 🛑 Mantenemos el cálculo de más/menos votado, pero priorizamos la lista completa.

      const masVotado = estadisticas[0] || null;
      const menosVotado = estadisticas[estadisticas.length - 1] || null; // 🏆 RESPUESTA MODIFICADA: Retorna directamente la lista completa de estadísticas // y añade los metadatos como el ID del proyecto, el total, el más y menos votado.

      res.status(200).json({
        proyecto_filtrado: idProyectoInt,
        total_lotes_con_favoritos: estadisticas.length, // Más descriptivo
        lote_mas_votado: masVotado,
        lote_menos_votado: menosVotado, // ✅ CAMBIO CLAVE: Retornar la lista completa con todos los lotes
        estadisticas_lotes: estadisticas,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  /**
   * @async
   * @function checkFavorito
   * @description Verifica si un lote específico es favorito del usuario.
   * @param {object} req - Objeto de solicitud (con id en params).
   * @param {object} res - Objeto de respuesta.
   */
  async checkFavorito(req, res) {
    try {
      const { id } = req.params;
      const idUsuario = req.user.id;

      const esFavorito = await favoritoService.isFavorito(idUsuario, id);
      res.status(200).json({ es_favorito: esFavorito });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = favoritoController;
