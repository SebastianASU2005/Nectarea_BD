// Archivo: tasks/projectScheduler.js

const cron = require("node-cron");
const proyectoService = require("../services/proyecto.service"); // Asegúrate que la ruta sea correcta

/**
 * 🎯 LÓGICA CENTRAL DE LA TAREA: Decrementa el contador 'meses_restantes' 
 * de los proyectos que están en estado 'En proceso'.
 * @async
 */
const advanceProjectMonth = async () => {
    console.log("--- Iniciando el avance del contador global de proyectos ---");
    try {
        // La función finalizeMes se encarga de:
        // 1. Buscar proyectos 'En proceso'.
        // 2. Decrementar 'meses_restantes' en 1.
        // 3. Notificar a administradores si el proyecto llega a 0 meses.
        const proyectosTerminados = await proyectoService.finalizarMes();
        
        console.log(`Avance mensual de proyectos completado. ${proyectosTerminados.length} proyectos terminaron su plazo.`);
    } catch (error) {
        console.error("❌ Error en el cron job de avance de proyectos:", error);
    }
};

// Objeto que contiene el job y los métodos para iniciar/ejecutar
const monthlyProjectAdvanceTask = {
    // 🗓️ CRON PROGRAMADO: Se ejecuta el DÍA 1 de cada mes a las 13:23 PM (un minuto antes que tu job de pagos).
    job: cron.schedule(
        "23 13 1 * *", // MINUTO 23, HORA 13 (1:23 PM), DÍA 1
        advanceProjectMonth,
        {
            scheduled: false,
        }
    ),

    start() {
        this.job.start();
        console.log(
            "Cron job de avance mensual de proyectos programado para ejecutarse a la 1:23 PM (hora de tu servidor) el DÍA 1 de cada mes. 🗓️"
        );
    },

    async runManual() {
        console.log("--- EJECUCIÓN MANUAL DE TAREA DE AVANCE DE PROYECTOS INICIADA ---");
        return advanceProjectMonth();
    },
};

module.exports = monthlyProjectAdvanceTask;