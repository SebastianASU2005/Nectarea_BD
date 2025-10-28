// services/favorito.service.js
const Favorito = require("../models/Favorito");
const Lote = require("../models/lote");
const Imagen = require("../models/imagen");
const { sequelize } = require("../config/database");

const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");
const favoritoService = {
  /**
   * @async
   * @function toggleFavorito
   * @description Agrega o elimina un lote de favoritos (toggle), con validación de suscripción activa.
   * @param {number} idUsuario - ID del usuario.
   * @param {number} idLote - ID del lote.
   * @returns {Promise<{agregado: boolean, mensaje: string}>}
   * @throws {Error} Si el lote no existe o si el usuario no tiene suscripción activa al proyecto privado.
   */
  async toggleFavorito(idUsuario, idLote) {
    // 1. Validar que el lote exista y esté activo, e incluir el id_proyecto
    const lote = await Lote.findOne({
      where: { id: idLote, activo: true },
      attributes: ["id", "id_proyecto"], // Solo necesitamos el ID del proyecto
    });

    if (!lote) {
      throw new Error("Lote no encontrado o no está activo.");
    } // ========================================================= // 🛑 VALIDACIÓN DE SUSCRIPCIÓN ACTIVA // =========================================================

    const idProyecto = lote.id_proyecto;

    if (idProyecto) {
      // Si el lote pertenece a un proyecto (subasta privada), verificar la suscripción activa
      const SuscripcionProyecto = require("../models/suscripcion_proyecto"); // Se asume la importación

      const suscripcion = await SuscripcionProyecto.findOne({
        where: {
          id_usuario: idUsuario,
          id_proyecto: idProyecto,
          activo: true, // 🚨 CORRECCIÓN CLAVE: Solo buscar suscripciones activas
        },
      });

      if (!suscripcion) {
        throw new Error(
          "Acceso denegado. Para agregar este lote a favoritos, debes tener una **suscripción activa** al proyecto asociado."
        );
      }
    } // ========================================================= // 🛑 FIN DE LA VALIDACIÓN // ========================================================= // 2. Buscar si ya existe el favorito (Lógica de toggle)
    const favoritoExistente = await Favorito.findOne({
      where: {
        id_usuario: idUsuario,
        id_lote: idLote,
      },
    });
    if (favoritoExistente) {
      // Eliminar favorito
      await favoritoExistente.destroy();
      return {
        agregado: false,
        mensaje: "Lote eliminado de favoritos.",
      };
    } else {
      // Agregar favorito
      await Favorito.create({
        id_usuario: idUsuario,
        id_lote: idLote,
      });
      return {
        agregado: true,
        mensaje: "Lote agregado a favoritos.",
      };
    }
  },
  /**
   * @async
   * @function findFavoritosByUsuario
   * @description Obtiene todos los lotes favoritos activos de un usuario.
   * @param {number} idUsuario - ID del usuario.
   * @returns {Promise<Lote[]>}
   */
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

    // Retornar solo los lotes
    return favoritos.map((fav) => fav.lote);
  },

  /**
   * @async
   * @function getEstadisticasFavoritos
   * @description Obtiene estadísticas de favoritos por lote (para administradores).
   * @param {number} [idProyecto] - ID opcional del proyecto para filtrar.
   * @returns {Promise<Array>}
   */
  async getEstadisticasFavoritos(idProyecto) {
    // ... (loteWhere se mantiene igual)
    const loteWhere = { activo: true, id_proyecto: idProyecto };
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
            ["id", "lote_id"],
            ["nombre_lote", "lote_nombre_lote"],
            ["estado_subasta", "lote_estado_subasta"], // ⬅️ Alias definido
            ["precio_base", "lote_precio_base"], // ⬅️ Alias definido
            ["id_proyecto", "lote_id_proyecto"], // ⬅️ Alias definido
          ],
          where: loteWhere,
        },
      ],
      group: [
        "Favorito.id_lote",
        "lote.id",
        "lote.nombre_lote",
        "lote.estado_subasta",
        "lote.precio_base",
        "lote.id_proyecto",
      ],
      order: [
        [sequelize.fn("COUNT", sequelize.col("Favorito.id_lote")), "DESC"],
      ],
      subQuery: false,
      raw: true,
    }); // 🏆 CORRECCIÓN FINAL DEL MAPEO: Usar la notación de corchetes con el prefijo 'lote.'

    return estadisticas.map((stat) => ({
      lote: {
        // USANDO stat['lote.ALIAS'] para la recuperación robusta
        id: stat["lote.lote_id"],
        nombre_lote: stat["lote.lote_nombre_lote"],
        estado_subasta: stat["lote.lote_estado_subasta"], // ⬅️ Corregido
        precio_base: stat["lote.lote_precio_base"], // ⬅️ Corregido
        id_proyecto: stat["lote.lote_id_proyecto"], // ⬅️ Corregido
        imagenes: [],
      },
      total_favoritos: parseInt(stat.total_favoritos),
    }));
  },
  /**
   * @async
   * @function isFavorito
   * @description Verifica si un lote es favorito de un usuario.
   * @param {number} idUsuario - ID del usuario.
   * @param {number} idLote - ID del lote.
   * @returns {Promise<boolean>}
   */
  async isFavorito(idUsuario, idLote) {
    const favorito = await Favorito.findOne({
      where: {
        id_usuario: idUsuario,
        id_lote: idLote,
      },
    });

    return !!favorito;
  },
};

module.exports = favoritoService;
