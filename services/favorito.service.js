// services/favorito.service.js
const Favorito = require("../models/Favorito");
const Lote = require("../models/lote");
const Imagen = require("../models/imagen");
const { sequelize } = require("../config/database");

// Nota: Se importan para asegurar que Sequelize pueda resolver las relaciones, aunque no se usen directamente.
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");

const favoritoService = {
  /**
   * @async
   * @function toggleFavorito
   * @description Agrega o elimina un lote de favoritos (toggle). Incluye validación de suscripción activa si el lote pertenece a un proyecto privado.
   * @param {number} idUsuario - ID del usuario.
   * @param {number} idLote - ID del lote.
   * @returns {Promise<{agregado: boolean, mensaje: string}>} Objeto indicando si se agregó o eliminó, y un mensaje.
   * @throws {Error} Si el lote no existe o si el usuario no tiene suscripción activa al proyecto privado asociado.
   */
  async toggleFavorito(idUsuario, idLote) {
    // 1. Validar que el lote exista y esté activo, incluyendo el ID del proyecto asociado.
    const lote = await Lote.findOne({
      where: { id: idLote, activo: true },
      attributes: ["id", "id_proyecto"], // Se recupera solo la información necesaria.
    });

    if (!lote) {
      throw new Error("Lote no encontrado o no está activo.");
    }

    const idProyecto = lote.id_proyecto; // 2. Lógica de acceso: Verificar suscripción activa si el lote está asociado a un proyecto (es un lote privado).

    if (idProyecto) {
      // Se re-importa SuscripcionProyecto por si la importación superior no se resolvió correctamente en el scope.
      const SuscripcionProyecto = require("../models/suscripcion_proyecto"); // Buscar una suscripción activa y válida para este usuario y proyecto.

      const suscripcion = await SuscripcionProyecto.findOne({
        where: {
          id_usuario: idUsuario,
          id_proyecto: idProyecto,
          activo: true, // Condición clave: Solo se permite si la suscripción está activa.
        },
      });

      if (!suscripcion) {
        throw new Error(
          "Acceso denegado. Para agregar este lote a favoritos, debes tener una **suscripción activa** al proyecto asociado."
        );
      }
    } // 3. Buscar si ya existe el favorito (Lógica de "toggle").

    const favoritoExistente = await Favorito.findOne({
      where: {
        id_usuario: idUsuario,
        id_lote: idLote,
      },
    });

    if (favoritoExistente) {
      // Si existe, lo elimina.
      await favoritoExistente.destroy();
      return {
        agregado: false,
        mensaje: "Lote eliminado de favoritos.",
      };
    } else {
      // Si no existe, lo crea.
      await Favorito.create({
        id_usuario: idUsuario,
        id_lote: idLote,
      });
      return {
        agregado: true,
        mensaje: "Lote agregado a favoritos.",
      };
    }
  }
  /**
   * @async
   * @function findFavoritosByUsuario
   * @description Obtiene todos los lotes favoritos de un usuario. Incluye los datos del lote y sus imágenes, filtrando solo lotes activos.
   * @param {number} idUsuario - ID del usuario.
   * @returns {Promise<Lote[]>} Array de objetos Lote (sin la entidad Favorito).
   */,

  async findFavoritosByUsuario(idUsuario) {
    // Buscar todos los registros de favoritos para el usuario.
    const favoritos = await Favorito.findAll({
      where: { id_usuario: idUsuario },
      include: [
        {
          model: Lote,
          as: "lote",
          where: { activo: true }, // Asegura que solo se incluyan lotes activos.
          include: [{ model: Imagen, as: "imagenes" }],
        },
      ],
      order: [["fecha_creacion", "DESC"]],
    }); // Mapear el resultado para retornar solo el objeto Lote (limpieza de la entidad Favorito).

    return favoritos.map((fav) => fav.lote);
  }
  /**
   * @async
   * @function getEstadisticasFavoritos
   * @description Obtiene el conteo de favoritos por lote, incluyendo los detalles del lote. Opcionalmente filtra por proyecto.
   * @param {number} [idProyecto] - ID opcional del proyecto para filtrar (usado en la cláusula WHERE del Lote).
   * @returns {Promise<Array<{lote: object, total_favoritos: number}>>} Array de objetos con el lote y el total de favoritos.
   */,

  async getEstadisticasFavoritos(idProyecto) {
    // Construir la condición de búsqueda para el modelo Lote.
    const loteWhere = { activo: true };
    if (idProyecto) {
      loteWhere.id_proyecto = idProyecto;
    }

    const estadisticas = await Favorito.findAll({
      // Seleccionar el ID del lote y contar cuántos registros de Favorito hay por lote.
      attributes: [
        "id_lote",
        [
          sequelize.fn("COUNT", sequelize.col("Favorito.id_lote")),
          "total_favoritos", // Alias para el conteo.
        ],
      ],
      include: [
        {
          model: Lote,
          as: "lote", // Definición explícita de atributos con alias para evitar conflictos.
          attributes: [
            ["id", "lote_id"],
            ["nombre_lote", "lote_nombre_lote"],
            ["estado_subasta", "lote_estado_subasta"],
            ["precio_base", "lote_precio_base"],
            ["id_proyecto", "lote_id_proyecto"],
          ],
          where: loteWhere, // Aplicar el filtro de actividad y proyecto (si aplica).
        },
      ], // Agrupar por todos los atributos seleccionados del lote y del favorito.
      group: [
        "Favorito.id_lote",
        "lote.id",
        "lote.nombre_lote",
        "lote.estado_subasta",
        "lote.precio_base",
        "lote.id_proyecto",
      ], // Ordenar por el número de favoritos de forma descendente.
      order: [
        [sequelize.fn("COUNT", sequelize.col("Favorito.id_lote")), "DESC"],
      ],
      subQuery: false, // Necesario para evitar problemas con GROUP BY en subconsultas.
      raw: true, // Retornar resultados sin el objeto Sequelize para facilitar el mapeo posterior.
    }); // Mapear el resultado raw para reestructurar los datos y convertir el conteo a número.

    return estadisticas.map((stat) => ({
      lote: {
        // Se usa la notación de corchetes con el prefijo 'lote.' para acceder a los alias de la consulta raw.
        id: stat["lote.lote_id"],
        nombre_lote: stat["lote.lote_nombre_lote"],
        estado_subasta: stat["lote.lote_estado_subasta"],
        precio_base: stat["lote.lote_precio_base"],
        id_proyecto: stat["lote.lote_id_proyecto"],
        imagenes: [], // Se deja vacío ya que las imágenes no se incluyen en esta consulta de estadísticas.
      },
      total_favoritos: parseInt(stat.total_favoritos), // Asegurar que sea un número entero.
    }));
  }
  /**
   * @async
   * @function isFavorito
   * @description Verifica rápidamente si un lote es favorito para un usuario específico.
   * @param {number} idUsuario - ID del usuario.
   * @param {number} idLote - ID del lote.
   * @returns {Promise<boolean>} Retorna true si el lote es favorito, false en caso contrario.
   */,

  async isFavorito(idUsuario, idLote) {
    // Intenta encontrar un registro de favorito que coincida con ambos IDs.
    const favorito = await Favorito.findOne({
      where: {
        id_usuario: idUsuario,
        id_lote: idLote,
      },
    }); // Usa el operador !! para convertir el resultado (objeto o null) a un booleano (true o false).

    return !!favorito;
  },
};

module.exports = favoritoService;
