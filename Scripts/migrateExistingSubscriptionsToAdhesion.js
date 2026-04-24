// scripts/migrateExistingSubscriptionsToAdhesion.js
// Ejecutar UNA SOLA VEZ para migrar suscripciones existentes al sistema de adhesión.
// Comando: node scripts/migrateExistingSubscriptionsToAdhesion.js

const { sequelize } = require("../config/database");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");
const Adhesion = require("../models/adhesion");
const CuotaMensual = require("../models/CuotaMensual");

async function migrate() {
  const t = await sequelize.transaction();
  try {
    console.log("🔄 Iniciando migración de suscripciones existentes...");

    // 1. Obtener IDs de proyectos mensuales
    const proyectosMensuales = await Proyecto.findAll({
      where: { tipo_inversion: "mensual", activo: true },
      attributes: ["id"],
      transaction: t,
    });
    const idsProyectosMensuales = proyectosMensuales.map((p) => p.id);

    if (idsProyectosMensuales.length === 0) {
      console.log("⚠️ No hay proyectos mensuales activos.");
      await t.commit();
      return;
    }

    // 2. Obtener todas las suscripciones ACTIVAS de esos proyectos
    const suscripciones = await SuscripcionProyecto.findAll({
      where: {
        activo: true,
        id_proyecto: idsProyectosMensuales,
      },
      transaction: t,
    });

    if (suscripciones.length === 0) {
      console.log(
        "⚠️ No hay suscripciones activas de proyectos mensuales para migrar.",
      );
      await t.commit();
      return;
    }

    let creadas = 0;
    let actualizadas = 0;

    for (const suscripcion of suscripciones) {
      // Verificar si ya tiene una adhesión asociada
      const adhesionExistente = await Adhesion.findOne({
        where: { id_suscripcion: suscripcion.id },
        transaction: t,
      });

      if (adhesionExistente) {
        console.log(
          `⏩ Suscripción ${suscripcion.id} ya tiene adhesión. Omitiendo.`,
        );
        continue;
      }

      // Obtener la última cuota mensual del proyecto (para valor_movil)
      const cuotaMensual = await CuotaMensual.findOne({
        where: { id_proyecto: suscripcion.id_proyecto },
        order: [["createdAt", "DESC"]],
        transaction: t,
      });

      const valorMovil = cuotaMensual
        ? parseFloat(cuotaMensual.valor_movil)
        : 0;
      const montoAdhesion = 0; // Monto simbólico, no se cobra

      // Crear adhesión completada (sin deuda)
      await Adhesion.create(
        {
          id_usuario: suscripcion.id_usuario,
          id_proyecto: suscripcion.id_proyecto,
          id_suscripcion: suscripcion.id,
          valor_movil_referencia: valorMovil,
          porcentaje_adhesion: 4.0,
          monto_total_adhesion: montoAdhesion,
          plan_pago: "contado",
          cuotas_totales: 1,
          cuotas_pagadas: 1,
          estado: "completada",
          fecha_completada: new Date(),
          activo: true,
        },
        { transaction: t },
      );

      // Asegurar que la suscripción tenga adhesion_completada = true
      if (!suscripcion.adhesion_completada) {
        await suscripcion.update(
          { adhesion_completada: true },
          { transaction: t },
        );
        actualizadas++;
      }

      creadas++;
      console.log(
        `✅ Migrada suscripción ID ${suscripcion.id} (usuario ${suscripcion.id_usuario})`,
      );
    }

    await t.commit();
    console.log(
      `🎉 Migración completada. Adhesiones creadas: ${creadas}, suscripciones actualizadas: ${actualizadas}`,
    );
  } catch (error) {
    await t.rollback();
    console.error("❌ Error durante la migración:", error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

migrate();
