// Archivo: cron.js (o scheduler.js)

const cron = require('node-cron');
const PujaService = require('../services/puja.service');
const LoteService = require('../services/lote.service');
const { sequelize } = require('../config/database'); 

/**
 * Función que encapsula la lógica de manejo de impagos.
 */
const checkExpiredBids = async () => {
    const TASK_NAME = "ManejoImpagoPuja";
    console.log(`[CRON - ${TASK_NAME}] Iniciando verificación de pujas vencidas en: ${new Date().toLocaleString()}`);

    let t;
    try {
        // 1. Obtener todas las pujas en estado 'ganadora_pendiente' cuya fecha de pago ha vencido
        const pujasVencidas = await PujaService.findExpiredGanadoraPendiente();
        
        if (pujasVencidas.length === 0) {
            console.log(`[CRON - ${TASK_NAME}] No se encontraron pujas vencidas. Terminando.`);
            return;
        }

        console.log(`[CRON - ${TASK_NAME}] Se encontraron ${pujasVencidas.length} lotes con pago vencido.`);

        // Usar un Set para procesar cada lote una sola vez
        const lotesAProcesar = [...new Set(pujasVencidas.map(puja => puja.id_lote))];

        for (const loteId of lotesAProcesar) {
            t = await sequelize.transaction();
            try {
                console.log(`[CRON - ${TASK_NAME}] Procesando impago para Lote ID: ${loteId}`);
                
                // 2. Ejecutar la función clave del LoteService para reasignar/limpiar
                const result = await LoteService.handleImpago(loteId, t);
                
                await t.commit();

                // 3. Notificación (Simulación):
                if (result.type === 'reasignacion') {
                    console.log(`[CRON - ${TASK_NAME} OK] Lote ${loteId} reasignado a la Puja ID: ${result.nuevaPujaId}.`);
                    // Aquí se notificaría al usuario incumplidor y al nuevo ganador.
                } else if (result.type === 'limpieza') {
                    console.log(`[CRON - ${TASK_NAME} OK] Lote ${loteId} limpiado y listo para reingreso. Límite de 3 intentos alcanzado.`);
                }

            } catch (error) {
                if (t) await t.rollback();
                console.error(`[CRON - ${TASK_NAME} ERROR] Fallo al procesar el Lote ID ${loteId}. Se revirtió la transacción:`, error.message);
            }
        }
        
        console.log(`[CRON - ${TASK_NAME}] Verificación de impagos finalizada.`);

    } catch (error) {
        console.error(`[CRON - ${TASK_NAME} ERROR GLOBAL] Fallo al obtener pujas vencidas o al inicializar:`, error.message);
    }
};

/**
 * Inicializa y programa la tarea cron.
 * Se ejecuta todos los días a las 01:00 AM.
 */
const startCronJobs = () => {
    // 0 1 * * * = A la 1:00 AM, todos los días.
    cron.schedule('0 1 * * *', checkExpiredBids, {
        scheduled: true,
        timezone: "America/Argentina/Mendoza"
    });

    console.log("Servicio de Cron Jobs iniciado. Tarea 'ManejoImpagoPuja' programada para la 1:00 AM.");
};


// Exportar la función de inicio y la función de tarea
module.exports = { startCronJobs, checkExpiredBids };