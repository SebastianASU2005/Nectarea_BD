const Proyecto = require("../models/proyecto");
const Lote = require("../models/lote");
const Imagen = require("../models/imagen");
const Inversion = require("../models/inversion"); // Asumo que se usa para findByUserId

const proyectoService = {
  /**
   * Crea un nuevo proyecto y asocia los lotes, aplicando reglas de negocio estrictas.
   * @param {object} projectData - Datos del proyecto a crear.
   * @param {number[]} lotesIds - IDs de los lotes a asociar.
   * @returns {Promise<object>} El proyecto recién creado.
   */
  async crearProyecto(projectData, lotesIds) {
    const { tipo_inversion, obj_suscripciones, monto_inversion, ...rest } =
      projectData;

    if (!tipo_inversion) {
      throw new Error("El tipo de inversión es obligatorio.");
    }

    let dataFinal = { ...rest, tipo_inversion };

    // 1. Aplicar reglas de negocio basadas en el tipo de inversión (sin cambios)
    switch (tipo_inversion) {
      case "directo":
        dataFinal.obj_suscripciones = 0;
        dataFinal.moneda = "USD";
        dataFinal.pack_de_lotes = true; // Entrega anticipada activa

        if (!monto_inversion || Number(monto_inversion) <= 0) {
          throw new Error(
            "El monto de inversión debe ser definido para proyectos 'directo'."
          );
        }
        dataFinal.monto_inversion = Number(monto_inversion).toFixed(2);
        break;

      case "mensual":
        dataFinal.moneda = "ARS";

        const finalObjSuscripciones = Number(obj_suscripciones || 0);
        if (finalObjSuscripciones <= 0) {
          throw new Error(
            "El objetivo de suscripciones debe ser mayor a cero para proyectos 'mensual'."
          );
        }
        dataFinal.obj_suscripciones = finalObjSuscripciones;

        dataFinal.pack_de_lotes = false; // Entrega anticipada inactiva

        if (!monto_inversion || Number(monto_inversion) <= 0) {
          throw new Error(
            "El monto base mensual debe ser definido para proyectos 'mensual'."
          );
        }
        dataFinal.monto_inversion = Number(monto_inversion).toFixed(2);
        break;

      default:
        throw new Error(
          "Tipo de inversión no válido. Use 'directo' o 'mensual'."
        );
    }

    // 2. Establecer valores por defecto si no se proporcionaron
    dataFinal.suscripciones_actuales = dataFinal.suscripciones_actuales || 0;
    dataFinal.estado_proyecto = dataFinal.estado_proyecto || "En Espera";
    dataFinal.activo = dataFinal.activo !== undefined ? dataFinal.activo : true;

    // 3. VALIDACIÓN DE UNICIDAD DE LOTES
    if (lotesIds && lotesIds.length > 0) {
      // Buscar lotes que ya estén asociados a CUALQUIER proyecto (donde idProyecto NO es nulo o 0)
      const lotesAsignados = await Lote.findAll({
        where: {
          id: lotesIds,
          idProyecto: { [require("sequelize").Op.ne]: null }, // Busca donde idProyecto no es null
        },
      });

      if (lotesAsignados.length > 0) {
        // Obtener los IDs de los lotes problemáticos para el mensaje de error
        const idsConflictivos = lotesAsignados
          .map((lote) => lote.id)
          .join(", ");
        throw new Error(
          `Los lotes con ID(s) ${idsConflictivos} ya están asociados a otro proyecto y no pueden ser reutilizados.`
        );
      }
    }

    let nuevoProyecto;
    try {
      // 4. Crear el proyecto en la base de datos
      nuevoProyecto = await Proyecto.create(dataFinal);

      // 5. Asociar lotes y actualizar el campo idProyecto en el modelo Lote
      if (lotesIds && lotesIds.length > 0) {
        // Opción A: Si usas la relación de Sequelize (Proyecto.hasMany(Lote))
        const lotes = await Lote.findAll({ where: { id: lotesIds } });
        await nuevoProyecto.addLotes(lotes);

        // Opción B (Alternativa, si prefieres actualización masiva):
        // await Lote.update({ idProyecto: nuevoProyecto.id }, { where: { id: lotesIds } });
      }

      return nuevoProyecto;
    } catch (error) {
      // Si la creación del proyecto falla, no hay nada que limpiar, pero es bueno manejar el error
      console.error("Error al crear el proyecto o asociar lotes:", error);
      throw error;
    }
  },

  // --- Funciones CRUD existentes ---

  // Obtiene todos los proyectos (para administradores)
  async findAll() {
    return await Proyecto.findAll({
      include: [
        { model: Lote, as: "lotes" },
        { model: Imagen, as: "imagenes" },
      ],
    });
  },

  // Obtiene los proyectos activos (para usuarios)
  async findAllActivo() {
    return await Proyecto.findAll({
      where: { activo: true },
      include: [
        { model: Lote, as: "lotes" },
        { model: Imagen, as: "imagenes" },
      ],
    });
  },

  // Obtiene un proyecto por ID (para administradores)
  async findById(id) {
    return await Proyecto.findByPk(id, {
      include: [
        { model: Lote, as: "lotes" },
        { model: Imagen, as: "imagenes" },
      ],
    });
  },

  // Obtiene un proyecto por ID, verificando que no esté eliminado (para usuarios)
  async findByIdActivo(id) {
    return await Proyecto.findOne({
      where: { id: id, activo: true },
      include: [
        { model: Lote, as: "lotes" },
        { model: Imagen, as: "imagenes" },
      ],
    });
  },

  // Busca proyectos por el ID de un usuario
  async findByUserId(userId) {
    return await Proyecto.findAll({
      include: [
        {
          model: Inversion,
          where: { id_usuario: userId, estado: "pagado" },
          required: true,
        },
        { model: Lote, as: "lotes" },
        { model: Imagen, as: "imagenes" },
      ],
      where: { activo: true },
    });
  },

  // Actualiza un proyecto
  async update(id, data, transaction) {
    // 🔑 Agregar el parámetro transaction
    const proyecto = await Proyecto.findByPk(id, { transaction });
    if (!proyecto) {
      return null;
    } // 🔑 Usar la transacción al actualizar
    return await proyecto.update(data, { transaction });
  },

  // Elimina lógicamente un proyecto
  async softDelete(id) {
    const proyecto = await Proyecto.findByPk(id);
    if (!proyecto) {
      return null;
    }
    proyecto.activo = false;
    return await proyecto.save();
  },
};

module.exports = proyectoService;
