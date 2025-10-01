const Inversion = require("../models/inversion");
const Proyecto = require("../models/proyecto");
const Transaccion = require("../models/transaccion");
const { sequelize } = require("../config/database");

const inversionService = {
  // Función para crear una inversión y su transacción asociada
  async crearInversionYTransaccion(data) {
    const { id_proyecto, id_usuario } = data; // 1. Validar el proyecto y obtener el tipo de inversión y el monto

    const proyecto = await Proyecto.findByPk(id_proyecto);
    if (!proyecto) {
      throw new Error("Proyecto no encontrado.");
    }
    if (proyecto.tipo_inversion !== "directo") {
      throw new Error(
        "Solo se pueden crear inversiones directas en proyectos de tipo 'directo'."
      );
    }

    const montoInversion = proyecto.monto_inversion;
    if (montoInversion === null || typeof montoInversion === "undefined") {
      throw new Error(
        "El monto de inversión del proyecto es nulo. No se puede crear la transacción."
      );
    }

    const tipoInversion = proyecto.tipo_inversion; // Iniciar una transacción de base de datos

    const t = await sequelize.transaction();

    try {
      // 2. Crear la inversión
      const nuevaInversion = await Inversion.create(
        {
          id_usuario: id_usuario,
          id_proyecto: id_proyecto,
          monto: montoInversion,
          estado: "pendiente",
        },
        {
          transaction: t,
        }
      ); // 3. Crear la transacción asociada

      const nuevaTransaccion = await Transaccion.create(
        {
          id_inversion: nuevaInversion.id,
          id_usuario: id_usuario,
          monto: nuevaInversion.monto,
          metodo_pago: "manual",
          tipo_transaccion: tipoInversion,
          estado_transaccion: "pendiente",
        },
        {
          transaction: t,
        }
      ); // 4. Si todo fue exitoso, confirmar la transacción

      await t.commit();

      return {
        nuevaInversion,
        nuevaTransaccion,
      };
    } catch (error) {
      // Si ocurre un error, revertir todos los cambios
      await t.rollback();
      throw new Error(
        `Error al crear inversión y transacción: ${error.message}`
      );
    }
  }
  /**
   * Lógica específica para confirmar una inversión directa.
   * @param {number} inversionId - El ID de la inversión a confirmar.
   * @param {object} t - La transacción de Sequelize.
   */,

  async confirmarInversion(inversionId, t) {
    // 1. Encontrar la inversión asociada
    const inversion = await Inversion.findByPk(inversionId, {
      transaction: t,
    });
    if (!inversion) {
      throw new Error("Inversión asociada a la transacción no encontrada.");
    } // 2. Encontrar el proyecto asociado
    const proyecto = await Proyecto.findByPk(inversion.id_proyecto, {
      transaction: t,
    });
    if (!proyecto) {
      throw new Error("Proyecto asociado a la inversión no encontrado.");
    } // 3. Actualizar el monto de fondeo (suscripciones_actuales) // ✅ CAMBIO: Usamos Number() para asegurar el tipo numérico antes de sumar.
    const montoInvertido = Number(inversion.monto);
    const montoActual = Number(proyecto.suscripciones_actuales || 0);
    const nuevoMontoTotal = montoActual + montoInvertido; // Si este campo en el modelo 'Proyecto' es INTEGER, este update fallará

    // cuando nuevoMontoTotal tenga decimales.
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
