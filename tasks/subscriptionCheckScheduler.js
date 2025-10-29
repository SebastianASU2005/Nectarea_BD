// Archivo: schedulers/subscriptionCheckScheduler.js

const cron = require("node-cron");
const proyectoService = require("../services/proyecto.service");
const { sequelize } = require("../config/database");

/**
 * Programador de tareas para verificar el estado de las suscripciones mínimas en proyectos mensuales.
 */
const subscriptionCheckScheduler = {
  /**
   * Programa la tarea de verificación de umbral mínimo de suscripciones.
   */
  scheduleJobs() {
    // ⏰ CRON JOB: Se ejecuta CADA 10 HORAS (Minuto 0 de la hora 0, 10 y 20).
    // MINUTO HORA DÍA-MES MES DÍA-SEMANA
    // 0 */10 * * *
    cron.schedule(
      "0 */10 * * *", // 🚨 CAMBIO AQUÍ: Ejecución cada 10 horas
      async () => {
        console.log(
          "--- Ejecutando verificación de umbral mínimo de suscripciones (CRON CADA 10 HORAS) ---"
        );

        // Uso de una transacción global para la búsqueda inicial puede no ser necesario,
        // pero se mantiene la estructura por si la función 'findProjectsToRevert' la requiere.
        let transaction;
        try {
          // 1. Encontrar todos los proyectos que necesitan ser revertidos
          const proyectosARevertir =
            await proyectoService.findProjectsToRevert();

          if (proyectosARevertir.length === 0) {
            console.log("No se encontraron proyectos para revertir.");
            return;
          }

          console.log(
            `Proyectos encontrados para revertir: ${proyectosARevertir
              .map((p) => p.id)
              .join(", ")}`
          );

          // 2. Procesar cada proyecto. Se recomienda usar `Promise.all` para paralelizar,
          // pero manteniendo la transacción por proyecto para atomicidad, lo hacemos en serie
          // (como ya estaba) y nos aseguramos de no bloquear.
          for (const proyecto of proyectosARevertir) {
            // Se crea una transacción *nueva* por cada proyecto, asegurando que un fallo
            // en un proyecto no afecte la reversión de los demás.
            const projectTransaction = await sequelize.transaction();
            try {
              // El servicio revertirPorBajoUmbral manejará la lógica de reversión.
              const proyectoRevertido =
                await proyectoService.revertirPorBajoUmbral(
                  proyecto,
                  projectTransaction // Pasa la transacción individual
                );

              await projectTransaction.commit();
              console.log(
                `✅ Proyecto ID ${proyecto.id} revertido con éxito a 'En Espera'.`
              );
            } catch (error) {
              await projectTransaction.rollback(); // Rollback en caso de fallo
              // Importante: no detener el proceso si un proyecto falla
              console.error(
                `❌ Error al revertir el Proyecto ID ${proyecto.id}: ${error.message}`
              );
            }
          }
        } catch (error) {
          // Rollback de la transacción inicial (si existiera) o manejo del error de búsqueda/lógica global
          // Ya que no se usa una transacción para el "for", no hay `transaction` global que hacer rollback aquí.
          console.error(
            "❌ Error en la tarea principal de verificación de umbral:",
            error
          );
        }
        console.log(
          "--- Verificación de umbral mínimo de suscripciones completada. ---"
        );
      },
      {
        // timezone: "America/Argentina/Buenos_Aires" // Deja tu zona horaria si la necesitas
      }
    );
  },
};

module.exports = subscriptionCheckScheduler;
