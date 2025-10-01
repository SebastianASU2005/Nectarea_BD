      const cuotaMensualService = require("../services/cuota_mensual.service");
      const proyectoService = require("../services/proyecto.service");

      const cuotaMensualController = {
      /**
       * Lógica para la creación de una cuota mensual y el ajuste del monto del proyecto.
       */
      async create(req, res) {
          try {
          // Desestructuramos el id_proyecto y el resto de los datos del body
          const { id_proyecto, nombre_cemento_cemento, ...cuotaMensualData } = req.body;

          // 1. Verificar si el id_proyecto fue proporcionado
          if (!id_proyecto) {
              return res.status(400).json({ error: 'El id_proyecto es un campo requerido.' });
          }

          // 2. Buscar el proyecto para obtener su nombre y el plazo de inversión
          const proyecto = await proyectoService.findById(id_proyecto);

          if (!proyecto) {
              return res.status(404).json({ error: "Proyecto no encontrado." });
          }

          // 3. Crear un objeto con todos los datos, incluyendo los valores del proyecto
          const datosCompletosCuota = {
              ...cuotaMensualData,
              id_proyecto: id_proyecto,
              nombre_cemento_cemento: nombre_cemento_cemento, // Nuevo campo
              nombre_proyecto: proyecto.nombre_proyecto,
              total_cuotas_proyecto: proyecto.plazo_inversion
          };

          // 4. Pasar el objeto completo al servicio
          const nuevaCuota = await cuotaMensualService.createAndSetProjectAmount(datosCompletosCuota);
          res.status(201).json(nuevaCuota);
          } catch (error) {
          res.status(400).json({ error: error.message });
          }
      },

      /**
       * Lógica para obtener todas las cuotas de un proyecto.
       */
      async findByProjectId(req, res) {
          try {
          const { id_proyecto } = req.params;
          const cuotas = await cuotaMensualService.findByProjectId(id_proyecto);
          res.status(200).json(cuotas);
          } catch (error) {
          res.status(500).json({ error: error.message });
          }
      },

      /**
       * Lógica para obtener la última cuota de un proyecto.
       */
      async findLastByProjectId(req, res) {
          try {
          const { id_proyecto } = req.params;
          const cuota = await cuotaMensualService.findLastByProjectId(id_proyecto);
          if (!cuota) {
              return res.status(404).json({ error: "No se encontró ninguna cuota para este proyecto." });
          }
          res.status(200).json(cuota);
          } catch (error) {
          res.status(500).json({ error: error.message });
          }
      },

      /**
       * Lógica para actualizar una cuota.
       */
      async update(req, res) {
          try {
          const { id } = req.params;
          const cuotaActualizada = await cuotaMensualService.update(id, req.body);
          if (!cuotaActualizada) {
              return res.status(404).json({ error: "Cuota no encontrada." });
          }
          res.status(200).json(cuotaActualizada);
          } catch (error) {
          res.status(400).json({ error: error.message });
          }
      },

      /**
       * Lógica para eliminar lógicamente una cuota.
       */
      async softDelete(req, res) {
          try {
          const { id } = req.params;
          const cuotaEliminada = await cuotaMensualService.softDelete(id);
          if (!cuotaEliminada) {
              return res.status(404).json({ error: "Cuota no encontrada." });
          }
          res.status(200).json({ mensaje: "Cuota eliminada exitosamente." });
          } catch (error) {
          res.status(500).json({ error: error.message });
          }
      },
      };

      module.exports = cuotaMensualController;
