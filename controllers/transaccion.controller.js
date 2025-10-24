  const transaccionService = require("../services/transaccion.service");
  // ⚠️ Importar sequelize para el manejo de transacciones de base de datos
  const { sequelize } = require("../config/database");

  /**
   * Controlador de Express para manejar las peticiones HTTP relacionadas con el modelo Transaccion.
   * Incluye la lógica de inicio/commit/rollback de transacciones de Sequelize para operaciones críticas.
   */
  const transaccionController = {
    /**
     * @async
     * @function create
     * @description Crea una nueva transacción, asignándola automáticamente al usuario autenticado.
     * @param {object} req - Objeto de solicitud de Express (con `req.user.id`).
     * @param {object} res - Objeto de respuesta de Express.
     */
    async create(req, res) {
      try {
        const id_usuario = req.user.id;
        const nuevaTransaccion = await transaccionService.create({
          ...req.body,
          id_usuario, // Asigna el ID del usuario autenticado
        });
        res.status(201).json(nuevaTransaccion);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    /**
     * @async
     * @function findAll
     * @description Obtiene todas las transacciones. Ruta típicamente para administradores.
     * @param {object} req - Objeto de solicitud de Express.
     * @param {object} res - Objeto de respuesta de Express.
     */
    async findAll(req, res) {
      try {
        const transacciones = await transaccionService.findAll();
        res.status(200).json(transacciones);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * @async
     * @function findMyTransactions
     * @description Obtiene todas las transacciones asociadas al usuario autenticado.
     * @param {object} req - Objeto de solicitud de Express (con `req.user.id`).
     * @param {object} res - Objeto de respuesta de Express.
     */
    async findMyTransactions(req, res) {
      try {
        const userId = req.user.id;
        const transacciones = await transaccionService.findByUserId(userId);
        res.status(200).json(transacciones);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * @async
     * @function confirmarTransaccion
     * @description Confirma una transacción por ID (usada por webhooks o procesos internos).
     * **CRÍTICO:** Ejecuta todo el proceso (actualización de Transacción, Inversión, etc.)
     * dentro de una transacción de Sequelize para garantizar atomicidad.
     * @param {object} req - Contiene el ID de la transacción en `req.params`.
     * @param {object} res - Objeto de respuesta de Express.
     */
    async confirmarTransaccion(req, res) {
      const { id } = req.params;
      let t; // Declarar la variable de transacción para que esté disponible en el `catch`
      try {
        t = await sequelize.transaction(); // Iniciar la transacción de Sequelize

        // Llamar al servicio, pasando el objeto de transacción activa
        const transaccion = await transaccionService.confirmarTransaccion(id, {
          transaction: t,
        });

        await t.commit(); // Confirmar todos los cambios en DB si el servicio fue exitoso

        res.status(200).json({
          mensaje: "Transacción y datos asociados actualizados con éxito",
          transaccion,
        });
      } catch (error) {
        if (t) {
          await t.rollback(); // Deshacer todos los cambios en caso de error
        }
        console.error(
          `Error en confirmarTransaccion para ID ${id}: ${error.message}`
        );
        // Devuelve el error al cliente
        res.status(400).json({ error: error.message });
      }
    },

    /**
     * @async
     * @function findAllActivo
     * @description Obtiene todas las transacciones que están marcadas como activas.
     */
    async findAllActivo(req, res) {
      try {
        const transaccionesActivas = await transaccionService.findAllActivo();
        res.status(200).json(transaccionesActivas);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * @async
     * @function findById
     * @description Obtiene una transacción por su ID (versión para administradores).
     */
    async findById(req, res) {
      try {
        const transaccion = await transaccionService.findById(req.params.id);
        if (!transaccion) {
          return res.status(404).json({ error: "Transacción no encontrada" });
        }
        res.status(200).json(transaccion);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * @async
     * @function findMyTransactionById
     * @description Obtiene una transacción por ID, verificando que pertenezca al usuario autenticado.
     */
    async findMyTransactionById(req, res) {
      try {
        const { id } = req.params;
        const userId = req.user.id;
        // Llama al servicio que verifica la pertenencia
        const transaccion = await transaccionService.findByIdAndUserId(
          id,
          userId
        );
        if (!transaccion) {
          return res
            .status(404)
            .json({ error: "Transacción no encontrada o no te pertenece." });
        }
        res.status(200).json(transaccion);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * @async
     * @function update
     * @description Actualiza una transacción por ID (versión para administradores).
     */
    async update(req, res) {
      try {
        const transaccionActualizada = await transaccionService.update(
          req.params.id,
          req.body
        );
        if (!transaccionActualizada) {
          return res.status(404).json({ error: "Transacción no encontrada" });
        }
        res.status(200).json(transaccionActualizada);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    /**
     * @async
     * @function updateMyTransaction
     * @description Actualiza una transacción, verificando la pertenencia al usuario autenticado.
     */
    async updateMyTransaction(req, res) {
      try {
        const { id } = req.params;
        const userId = req.user.id;
        // Llama al servicio que verifica la pertenencia y actualiza
        const transaccionActualizada =
          await transaccionService.updateByIdAndUserId(id, userId, req.body);
        if (!transaccionActualizada) {
          return res
            .status(404)
            .json({ error: "Transacción no encontrada o no te pertenece." });
        }
        res.status(200).json(transaccionActualizada);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    /**
     * @async
     * @function softDelete
     * @description "Elimina" lógicamente (soft delete) una transacción por ID (versión para administradores).
     */
    async softDelete(req, res) {
      try {
        const transaccionEliminada = await transaccionService.softDelete(
          req.params.id
        );
        if (!transaccionEliminada) {
          return res.status(404).json({ error: "Transacción no encontrada" });
        }
        res.status(204).send(); // Éxito sin contenido
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * @async
     * @function softDeleteMyTransaction
     * @description "Elimina" lógicamente una transacción, verificando la pertenencia al usuario autenticado.
     */
    async softDeleteMyTransaction(req, res) {
      try {
        const { id } = req.params;
        const userId = req.user.id;
        // Llama al servicio que verifica la pertenencia y elimina
        const transaccionEliminada =
          await transaccionService.softDeleteByIdAndUserId(id, userId);
        if (!transaccionEliminada) {
          return res
            .status(404)
            .json({ error: "Transacción no encontrada o no te pertenece." });
        }
        res.status(204).send();
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },
  };

  module.exports = transaccionController;
