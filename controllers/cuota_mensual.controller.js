const cuotaMensualService = require("../services/cuota_mensual.service");
const proyectoService = require("../services/proyecto.service");

const cuotaMensualController = {
  async create(req, res) {
    try {
      const { id_proyecto, nombre_cemento_cemento, ...cuotaMensualData } =
        req.body;
      if (!id_proyecto)
        return res.status(400).json({ error: "El id_proyecto es requerido." });

      const proyecto = await proyectoService.findById(id_proyecto);
      if (!proyecto)
        return res.status(404).json({ error: "Proyecto no encontrado." });

      const datosCompletosCuota = {
        ...cuotaMensualData,
        id_proyecto,
        nombre_cemento_cemento,
        nombre_proyecto: proyecto.nombre_proyecto,
        total_cuotas_proyecto: proyecto.plazo_inversion,
      };

      // ✅ Extraer datos de admin
      const adminContext = {
        adminId: req.user.id,
        ip: req.ip || req.headers["x-forwarded-for"] || null,
        userAgent: req.get("user-agent") || null,
      };

      const resultado = await cuotaMensualService.createAndSetProjectAmount(
        datosCompletosCuota,
        adminContext,
      );

      res.status(201).json({
        success: true,
        mensaje: "Cuota mensual creada exitosamente",
        cuota: resultado.cuota,
        sincronizacion: {
          resumenes_actualizados: resultado.resumenes_actualizados,
          mensaje:
            resultado.resumenes_actualizados > 0
              ? `Se actualizaron ${resultado.resumenes_actualizados} resúmenes de cuenta`
              : "No hay resúmenes de cuenta para actualizar",
        },
      });
    } catch (error) {
      console.error("❌ Error al crear cuota mensual:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;

      const adminContext = {
        adminId: req.user.id,
        ip: req.ip || req.headers["x-forwarded-for"] || null,
        userAgent: req.get("user-agent") || null,
      };

      const resultado = await cuotaMensualService.update(
        id,
        req.body,
        adminContext,
      );

      if (!resultado) {
        return res
          .status(404)
          .json({ success: false, error: "Cuota no encontrada." });
      }

      res.status(200).json({
        success: true,
        mensaje: "Cuota mensual actualizada exitosamente",
        cuota: resultado.cuota,
        sincronizacion: {
          resumenes_actualizados: resultado.resumenes_actualizados,
          mensaje:
            resultado.resumenes_actualizados > 0
              ? `✅ Se actualizaron ${resultado.resumenes_actualizados} resúmenes de cuenta`
              : "⚠️ No hay resúmenes de cuenta activos para este proyecto",
        },
      });
    } catch (error) {
      console.error("❌ Error al actualizar cuota mensual:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  },

  async softDelete(req, res) {
    try {
      const { id } = req.params;
      const adminContext = {
        adminId: req.user.id,
        ip: req.ip || req.headers["x-forwarded-for"] || null,
        userAgent: req.get("user-agent") || null,
      };
      const cuotaEliminada = await cuotaMensualService.softDelete(
        id,
        adminContext,
      );

      if (!cuotaEliminada) {
        return res
          .status(404)
          .json({ success: false, error: "Cuota no encontrada." });
      }

      res
        .status(200)
        .json({ success: true, mensaje: "Cuota eliminada exitosamente." });
    } catch (error) {
      console.error("❌ Error al eliminar cuota:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async findByProjectId(req, res) {
    try {
      const { id_proyecto } = req.params;
      const cuotas = await cuotaMensualService.findByProjectId(id_proyecto);
      res.status(200).json({ success: true, total: cuotas.length, cuotas });
    } catch (error) {
      console.error("❌ Error al obtener cuotas:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async findLastByProjectId(req, res) {
    try {
      const { id_proyecto } = req.params;
      const cuota = await cuotaMensualService.findLastByProjectId(id_proyecto);
      if (!cuota) {
        return res
          .status(404)
          .json({ success: false, error: "No se encontró ninguna cuota." });
      }
      res.status(200).json({ success: true, cuota });
    } catch (error) {
      console.error("❌ Error al obtener última cuota:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
};

module.exports = cuotaMensualController;
