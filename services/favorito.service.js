const Favorito = require("../models/Favorito");
const Lote = require("../models/lote");
const Imagen = require("../models/imagen");
const Proyecto = require("../models/proyecto");
const { sequelize } = require("../config/database");

const favoritoService = {
  async toggleFavorito(idUsuario, idLote) {
    const lote = await Lote.findOne({
      where: { id: idLote, activo: true },
      attributes: ["id", "id_proyecto"],
    });

    if (!lote) {
      throw new Error("Lote no encontrado o no está activo.");
    }

    const idProyecto = lote.id_proyecto;

    if (idProyecto) {
      const SuscripcionProyecto = require("../models/suscripcion_proyecto");
      const suscripcion = await SuscripcionProyecto.findOne({
        where: {
          id_usuario: idUsuario,
          id_proyecto: idProyecto,
          activo: true,
        },
      });

      if (!suscripcion) {
        throw new Error(
          "Acceso denegado. Para agregar este lote a favoritos, debes tener una suscripción activa al proyecto asociado.",
        );
      }
    }

    const favoritoExistente = await Favorito.findOne({
      where: { id_usuario: idUsuario, id_lote: idLote },
    });

    if (favoritoExistente) {
      await favoritoExistente.destroy();
      return { agregado: false, mensaje: "Lote eliminado de favoritos." };
    } else {
      await Favorito.create({ id_usuario: idUsuario, id_lote: idLote });
      return { agregado: true, mensaje: "Lote agregado a favoritos." };
    }
  },

  async findFavoritosByUsuario(idUsuario) {
    const favoritos = await Favorito.findAll({
      where: { id_usuario: idUsuario },
      include: [
        {
          model: Lote,
          as: "lote",
          where: { activo: true },
          include: [{ model: Imagen, as: "imagenes" }],
        },
      ],
      order: [["fecha_creacion", "DESC"]],
    });

    return favoritos.map((fav) => fav.lote);
  },

  async getEstadisticasProyecto(idProyecto) {
    const estadisticas = await Favorito.findAll({
      attributes: [
        "id_lote",
        [
          sequelize.fn("COUNT", sequelize.col("Favorito.id_lote")),
          "total_favoritos",
        ],
      ],
      include: [
        {
          model: Lote,
          as: "lote",
          attributes: ["id", "nombre_lote", "estado_subasta", "precio_base"],
          where: {
            activo: true,
            id_proyecto: idProyecto,
            excluir_estadisticas: false, // 👈 solo lotes no excluidos
          },
          required: true,
        },
      ],
      group: ["Favorito.id_lote", "lote.id"],
      order: [
        [sequelize.fn("COUNT", sequelize.col("Favorito.id_lote")), "DESC"],
      ],
      subQuery: false,
    });

    const lotesFavoritosFormateados = estadisticas.map((stat) => ({
      id_lote: stat.lote.id,
      nombre_lote: stat.lote.nombre_lote,
      estado_subasta: stat.lote.estado_subasta,
      precio_base: parseFloat(stat.lote.precio_base),
      total_favoritos: parseInt(stat.dataValues.total_favoritos),
    }));

    return {
      id_proyecto: idProyecto,
      total_lotes_con_favoritos: lotesFavoritosFormateados.length,
      lote_mas_votado: lotesFavoritosFormateados[0] || null,
      lote_menos_votado:
        lotesFavoritosFormateados[lotesFavoritosFormateados.length - 1] || null,
      estadisticas_lotes: lotesFavoritosFormateados,
    };
  },

  async getEstadisticasTodosProyectos() {
    const proyectos = await Proyecto.findAll({
      where: { activo: true },
      attributes: ["id", "nombre_proyecto", "tipo_inversion"],
    });

    const estadisticasPorProyecto = await Promise.all(
      proyectos.map(async (proyecto) => {
        const stats = await this.getEstadisticasProyecto(proyecto.id);

        return {
          id_proyecto: proyecto.id,
          nombre_proyecto: proyecto.nombre_proyecto,
          tipo_inversion: proyecto.tipo_inversion,
          total_lotes_con_favoritos: stats.total_lotes_con_favoritos,
          lote_mas_votado: stats.lote_mas_votado,
          total_favoritos_proyecto: stats.estadisticas_lotes.reduce(
            (sum, item) => sum + item.total_favoritos,
            0,
          ),
        };
      }),
    );

    return estadisticasPorProyecto.sort(
      (a, b) => b.total_favoritos_proyecto - a.total_favoritos_proyecto,
    );
  },

  async getRankingGlobal(limit = 10) {
    const estadisticas = await Favorito.findAll({
      attributes: [
        "id_lote",
        [
          sequelize.fn("COUNT", sequelize.col("Favorito.id_lote")),
          "total_favoritos",
        ],
      ],
      include: [
        {
          model: Lote,
          as: "lote",
          attributes: [
            "id",
            "nombre_lote",
            "estado_subasta",
            "precio_base",
            "id_proyecto",
          ],
          where: {
            activo: true,
            excluir_estadisticas: false, // 👈 solo lotes no excluidos
          },
          required: true,
          include: [
            {
              model: Proyecto,
              as: "proyectoLote",
              attributes: ["id", "nombre_proyecto"],
              required: false,
            },
          ],
        },
      ],
      group: ["Favorito.id_lote", "lote.id", "lote->proyectoLote.id"],
      order: [
        [sequelize.fn("COUNT", sequelize.col("Favorito.id_lote")), "DESC"],
      ],
      limit: limit,
      subQuery: false,
    });

    return estadisticas.map((stat) => ({
      id_lote: stat.lote.id,
      nombre_lote: stat.lote.nombre_lote,
      estado_subasta: stat.lote.estado_subasta,
      precio_base: parseFloat(stat.lote.precio_base),
      proyecto: stat.lote.proyectoLote
        ? {
            id: stat.lote.proyectoLote.id,
            nombre: stat.lote.proyectoLote.nombre_proyecto,
          }
        : null,
      total_favoritos: parseInt(stat.dataValues.total_favoritos),
    }));
  },

  async isFavorito(idUsuario, idLote) {
    const favorito = await Favorito.findOne({
      where: { id_usuario: idUsuario, id_lote: idLote },
    });
    return !!favorito;
  },

  /**
   * Activa o desactiva la exclusión de un lote de los rankings y estadísticas.
   * @param {number} idLote - ID del lote.
   * @returns {Promise<object>} Resultado del toggle.
   */
  async toggleExcluirEstadisticas(idLote) {
    const lote = await Lote.findByPk(idLote);
    if (!lote) throw new Error("Lote no encontrado.");

    await lote.update({ excluir_estadisticas: !lote.excluir_estadisticas });

    return {
      id_lote: lote.id,
      nombre_lote: lote.nombre_lote,
      excluir_estadisticas: lote.excluir_estadisticas,
      mensaje: lote.excluir_estadisticas
        ? "Lote excluido de estadísticas y rankings."
        : "Lote incluido nuevamente en estadísticas y rankings.",
    };
  },
};

module.exports = favoritoService;
