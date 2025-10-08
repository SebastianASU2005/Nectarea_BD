const Inversion = require("../models/inversion");
const Proyecto = require("../models/proyecto");
// const Transaccion = require("../models/transaccion"); // 🛑 ELIMINADA
const { sequelize } = require("../config/database");

const inversionService = {
  // Función para crear la inversión (solo la intención de negocio, estado 'pendiente')
  async crearInversion(data) {
    // 👈 CAMBIO DE NOMBRE
    const { id_proyecto, id_usuario } = data; // 1. Validar el proyecto y obtener el tipo de inversión y el monto
    const proyecto = await Proyecto.findByPk(id_proyecto);
    if (!proyecto) {
      throw new Error("Proyecto no encontrado.");
    } // 🚀 VALIDACIÓN CLAVE: No invertir en proyecto Finalizado o Cancelado
    if (
      proyecto.estado_proyecto === "Finalizado" ||
      proyecto.estado_proyecto === "Cancelado"
    ) {
      throw new Error(
        `No se puede crear una inversión, el proyecto "${proyecto.nombre_proyecto}" está en estado: ${proyecto.estado_proyecto}.`
      );
    }
    // ----------------------------------------------------

    if (proyecto.tipo_inversion !== "directo") {
      throw new Error(
        "Solo se pueden crear inversiones directas en proyectos de tipo 'directo'."
      );
    }

    const montoInversion = proyecto.monto_inversion;
    if (montoInversion === null || typeof montoInversion === "undefined") {
      throw new Error(
        "El monto de inversión del proyecto es nulo. No se puede registrar la inversión."
      );
    }

    const t = await sequelize.transaction();

    try {
      // 2. Crear la inversión con estado "pendiente"
      const nuevaInversion = await Inversion.create(
        {
          id_usuario: id_usuario,
          id_proyecto: id_proyecto,
          monto: montoInversion,
          estado: "pendiente", // CLAVE: Estado inicial pendiente
        },
        {
          transaction: t,
        }
      ); // 🛑 La lógica de creación de la Transacción y el PagoMercado ha sido eliminada de aquí.
      await t.commit();

      return nuevaInversion; // Retornamos solo la Inversión pendiente
    } catch (error) {
      // Si ocurre un error, revertir todos los cambios
      await t.rollback();
      throw new Error(`Error al crear inversión: ${error.message}`);
    }
  },
  /**
   * Lógica específica para confirmar una inversión directa (Mantenida).
   * Se llama desde el transaccionService cuando el pago es aprobado.
   */ async confirmarInversion(inversionId, t) {
    // 1. Encontrar la inversión asociada
    const inversion = await Inversion.findByPk(inversionId, {
      transaction: t,
    });
    if (!inversion) {
      throw new Error("Inversión asociada a la transacción no encontrada.");
    }
    if (inversion.estado === "pagado") {
      // Corregido: 'pagada' a 'pagado'
      // Idempotencia: No procesar dos veces
      return inversion;
    } // 2. Encontrar el proyecto asociado

    const proyecto = await Proyecto.findByPk(inversion.id_proyecto, {
      transaction: t,
    });
    if (!proyecto) {
      throw new Error("Proyecto asociado a la inversión no encontrado.");
    } // 3. Actualizar el monto de fondeo (suscripciones_actuales)
    const montoInvertido = Number(inversion.monto);
    const montoActual = Number(proyecto.suscripciones_actuales || 0);
    const nuevoMontoTotal = montoActual + montoInvertido;

    await proyecto.update(
      {
        suscripciones_actuales: nuevoMontoTotal,
      },
      { transaction: t }
    ); // 4. Marcar la inversión como 'pagado'
    inversion.estado = "pagado";
    await inversion.save({
      transaction: t,
    }); // 5. Si el proyecto es de tipo "directo" (inversión única), finalizarlo
    if (proyecto.tipo_inversion === "directo") {
      proyecto.estado_proyecto = "Finalizado";
      await proyecto.save({
        transaction: t,
      });
    }

    return inversion;
  }, // --- Funciones CRUD básicas ---

  async findById(id) {
    return await Inversion.findByPk(id);
  },
  async findAll() {
    return await Inversion.findAll();
  },
  async findByUserId(userId) {
    return await Inversion.findAll({
      where: {
        id_usuario: userId,
      },
    });
  },
  async findAllActivo() {
    return await Inversion.findAll({
      where: {
        activo: true,
      },
    });
  },
  async update(id, data) {
    const inversion = await Inversion.findByPk(id);
    if (!inversion) return null;
    return await inversion.update(data);
  },
  async softDelete(id) {
    const inversion = await Inversion.findByPk(id);
    if (!inversion) return null;
    return await inversion.update({
      activo: false,
    });
  },
};

module.exports = inversionService;
