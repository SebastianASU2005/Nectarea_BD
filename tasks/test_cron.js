const paymentTask = require('./monthlyPaymentGenerationTask'); // Asegura la ruta correcta

async function testManualRun() {
    try {
        await paymentTask.runManual();
        console.log("Prueba manual finalizada con éxito.");
    } catch (error) {
        console.error("Error durante la ejecución manual:", error);
    }
    // Para que el script Node termine, ya que la conexión a DB/Sequelize puede mantenerlo activo
    process.exit(0); 
}

testManualRun();