// controllers/favorito.controller.js
const favoritoService = require("../services/favorito.service");

const favoritoController = {
  async toggleFavorito(req, res) {
    try {
      const { id_lote } = req.body;
      const idUsuario = req.user.id;

      if (!id_lote) {
        return res.status(400).json({ error: "El ID del lote es requerido." });
      }

      const resultado = await favoritoService.toggleFavorito(idUsuario, id_lote);
      res.status(200).json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async getMisFavoritos(req, res) {
    try {
      const idUsuario = req.user.id;
      const favoritos = await favoritoService.findFavoritosByUsuario(idUsuario);
      res.status(200).json(favoritos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getEstadisticas(req, res) {
    try {
      const { id_proyecto, modo, limit } = req.query;

      if (id_proyecto) {
        const idProyectoInt = parseInt(id_proyecto);
        if (isNaN(idProyectoInt)) {
          return res.status(400).json({
            error: "El ID del proyecto debe ser un número válido.",
          });
        }
        const estadisticas = await favoritoService.getEstadisticasProyecto(idProyectoInt);
        return res.status(200).json(estadisticas);
      }

      if (modo === "todos") {
        const estadisticas = await favoritoService.getEstadisticasTodosProyectos();
        return res.status(200).json({
          modo: "todos_proyectos",
          total_proyectos: estadisticas.length,
          proyectos: estadisticas,
        });
      }

      if (modo === "global") {
        const limitInt = limit ? parseInt(limit) : 10;
        const ranking = await favoritoService.getRankingGlobal(limitInt);
        return res.status(200).json({
          modo: "ranking_global",
          total_resultados: ranking.length,
          ranking: ranking,
        });
      }

      return res.status(400).json({
        error: "Debes especificar un modo de consulta.",
        modos_disponibles: {
          proyecto_especifico: "?id_proyecto=1",
          todos_proyectos: "?modo=todos",
          ranking_global: "?modo=global&limit=20",
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

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

  /**
   * Activa o desactiva la exclusión de un lote de los rankings (solo admin).
   */
  async toggleExcluirEstadisticas(req, res) {
    try {
      const { id } = req.params;
      const resultado = await favoritoService.toggleExcluirEstadisticas(id);
      res.status(200).json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
};

module.exports = favoritoController;