const Lote = require("../models/lote");
const Imagen = require("../models/imagen");
const { Op } = require("sequelize");
const mensajeService = require("./mensaje.service");
const usuarioService = require("./usuario.service");
const { sequelize } = require("../config/database");

const loteService = {
  // Crea un nuevo lote
  // Crea un nuevo lote y valida que el proyecto exista
  async create(data) {
    const { id_proyecto } = data; // 1. VALIDACIÓN CLAVE: Asegurar que el ID del proyecto esté presente.

    if (!id_proyecto) {
      throw new Error("El lote debe estar asociado a un proyecto.");
    } // 2. VALIDACIÓN CLAVE: Verificar que el proyecto exista.

    const Proyecto = require("../models/proyecto"); // Importación local (si no está globalmente)
    const proyecto = await Proyecto.findByPk(id_proyecto);

    if (!proyecto) {
      throw new Error(`El proyecto con ID ${id_proyecto} no fue encontrado.`);
    }

    // 3. Crear el lote (si las validaciones pasan)
    return await Lote.create(data);
  }, 
  // Busca todos los lotes (para administradores)

  async findAll() {
    return await Lote.findAll({
      include: [{ model: Imagen, as: "imagenes" }],
    });
  }, // Busca todos los lotes que no estén eliminados (para usuarios)

  async findAllActivo() {
    return await Lote.findAll({
      where: { activo: true },
      include: [{ model: Imagen, as: "imagenes" }],
    });
  }, // Busca un lote por ID (para administradores)

  async findById(id) {
    return await Lote.findByPk(id, {
      include: [{ model: Imagen, as: "imagenes" }],
    });
  }, // Busca un lote por ID, verificando que no esté eliminado (para usuarios)

  async findByIdActivo(id) {
    return await Lote.findOne({
      where: {
        id: id,
        activo: true,
      },
      include: [{ model: Imagen, as: "imagenes" }],
    });
  }, // Actualiza un lote por ID

  async update(id, data) {
    const lote = await Lote.findByPk(id);
    if (!lote) {
      return null;
    } // AHORA SÍ: Guardamos el estado original antes de actualizar el objeto

    const estadoOriginal = lote.estado_subasta;

    const loteActualizado = await lote.update(data); // El mensaje se enviará si el nuevo estado es 'activa' Y el estado original NO era 'activa'
    if (
      loteActualizado.estado_subasta === "activa" &&
      estadoOriginal !== "activa"
    ) {
      const todosLosUsuarios = await usuarioService.findAllActivos();
      const remitente_id = 1;

      if (todosLosUsuarios.length > 1) {
        const contenido = `¡Subasta activa! El lote con ID ${loteActualizado.id} está ahora en subasta. ¡Revisa los detalles!`;
        for (const usuario of todosLosUsuarios) {
          if (usuario.id !== remitente_id) {
            await mensajeService.crear({
              id_remitente: remitente_id,
              id_receptor: usuario.id,
              contenido: contenido,
            });
          }
        }
      }
    }

    return loteActualizado;
  }, // Elimina lógicamente un lote

  async softDelete(id) {
    const lote = await Lote.findByPk(id);
    if (!lote) {
      return null;
    }
    lote.activo = false;
    return await lote.save();
  },

  async endAuction(id) {
    const t = await sequelize.transaction();
    const PujaService = require("./puja.service"); // Se eliminan los 'require' de servicios que ya no se usan en esta función (TransaccionService, SuscripcionProyecto)
    try {
      const lote = await Lote.findByPk(id, { transaction: t });
      if (!lote) throw new Error("Lote no encontrado.");
      if (lote.estado_subasta !== "activa")
        throw new Error("La subasta no está activa.");

      const pujaGanadora = await PujaService.findHighestBidForLote(id); // Actualiza el lote a "finalizado" independientemente de si hay una puja ganadora
      await lote.update(
        {
          estado_subasta: "finalizada",
          fecha_fin: new Date(),
        },
        { transaction: t }
      );

      if (pujaGanadora) {
        // **Paso 1:** Asigna el ganador en el lote
        await lote.update(
          { id_ganador: pujaGanadora.id_usuario },
          { transaction: t }
        ); // **Paso 2:** Actualiza el estado de la puja ganadora a 'ganadora_pendiente'
        await pujaGanadora.update(
          { estado_puja: "ganadora_pendiente" },
          { transaction: t }
        ); // NOTA IMPORTANTE: Ya NO se crea la Transacción aquí. El ganador debe pagar // explícitamente a través de una ruta separada.
      }
      await t.commit();
      if (pujaGanadora) {
        // Devuelve tokens a los perdedores (se hace fuera de la transacción para evitar bloqueos)
        await PujaService.gestionarTokensAlFinalizar(id); // Devolvemos la puja ganadora para que el controlador pueda usar sus datos para el pago.
        return pujaGanadora;
      }
      return null;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }, // Asocia un conjunto de lotes a un proyecto

  async updateLotesProyecto(lotesIds, idProyecto, transaction) {
    return Lote.update(
      { id_proyecto: idProyecto },
      {
        where: { id: { [Op.in]: lotesIds } },
        transaction,
      }
    );
  },
};

module.exports = loteService;
