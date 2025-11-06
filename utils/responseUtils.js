// utils/responseUtils.js

/**
 * @function formatErrorResponse
 * @description Formatea un mensaje de error o un objeto de Error en una estructura 
 * de respuesta JSON consistente y estandarizada para la API.
 * @param {string | Error} error - El mensaje de error o el objeto Error capturado.
 * @param {number} [statusCode=500] - El código de estado HTTP asociado (usado para el campo 'code' en la respuesta).
 * @returns {object} Un objeto con formato de error estandarizado.
 */
const formatErrorResponse = (error, statusCode = 500) => {
    let errorMessage = "Ocurrió un error inesperado.";
    let errorDetails = null;

    if (typeof error === 'string') {
        errorMessage = error;
    } else if (error instanceof Error) {
        // Usamos el mensaje del error
        errorMessage = error.message;
        
        // Solo incluimos detalles del stack trace en desarrollo por seguridad.
        errorDetails = process.env.NODE_ENV === 'development' ? error.stack : undefined;
    }

    return {
        success: false, // Indicador explícito de que la petición falló
        error: errorMessage,
        code: statusCode,
        details: errorDetails
    };
};

// Exportar las utilidades
module.exports = {
    formatErrorResponse
};