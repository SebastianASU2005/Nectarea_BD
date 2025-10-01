// services/pagoMercado.service.js
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago"); // <-- Paquete oficial en NPM
require("dotenv").config();

// --- Configuración CRÍTICA: LECTURA DESDE VARIABLES DE ENTORNO ---
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
// CRÍTICO: Asegurarse de que el HOST_URL no tenga espacios en blanco al final, como en el .env
const HOST_URL = (process.env.HOST_URL || "http://localhost:3000").trim();
const CURRENCY_ID = process.env.MP_CURRENCY_ID || "ARS";

// Inicializa Mercado Pago
let client = null;
let preferenceService = null;
let paymentServiceMp = null;

if (
  MP_ACCESS_TOKEN &&
  MP_ACCESS_TOKEN !== "[Pega_aqui_tu_TEST-Access_Token_de_MP]"
) {
  try {
    // Inicialización del nuevo SDK
    client = new MercadoPagoConfig({
      accessToken: MP_ACCESS_TOKEN,
      options: { timeout: 5000 }, // Tiempo de espera para peticiones
    }); // Crear instancias de los servicios que usaremos

    preferenceService = new Preference(client);
    paymentServiceMp = new Payment(client);
    console.log("✅ Mercado Pago SDK configurado y cliente listo.");
  } catch (error) {
    console.error(
      "❌ Error al inicializar el cliente de Mercado Pago:",
      error.message
    );
  }
} else {
  console.error(
    "⚠️ ERROR CRÍTICO: MP_ACCESS_TOKEN no está configurado o es el placeholder. La pasarela de pago está inoperativa."
  );
}

const paymentService = {
  /**
   * @description Crea la sesión de pago (Preferencia de MP) y devuelve la URL de redirección.
   */
  async createPaymentSession(inversion, transaccionId) {
    if (!preferenceService) {
      // Permite que el controlador maneje este error
      throw new Error(
        "El servicio de Mercado Pago (Preference) no está inicializado."
      );
    }

    const metodo = "mercadopago";
    const { id_usuario, monto, id_proyecto } = inversion; // Alerta sobre la URL de webhook
    if (HOST_URL.includes("localhost") || HOST_URL.includes("3000")) {
      console.warn(
        "🚨 ALERTA: HOST_URL es local. Webhooks NO funcionarán sin Ngrok."
      );
    }

    try {
      const preferenceBody = {
        items: [
          {
            title: `Inversion #${inversion.id} | Proyecto ID ${id_proyecto}`,
            unit_price: parseFloat(monto),
            quantity: 1,
            currency_id: CURRENCY_ID,
          },
        ], // external_reference es el ID de nuestra Transaccion local
        external_reference: String(transaccionId),
        back_urls: {
          // Usamos la Transacción ID para el reintento/consulta en el frontend
          success: `${HOST_URL}/pago/exito/${transaccionId}`,
          failure: `${HOST_URL}/pago/fallo/${transaccionId}`,
          pending: `${HOST_URL}/pago/pendiente/${transaccionId}`,
        }, // URL de Notificación: Siempre debe ser el endpoint del Webhook
        notification_url: `${HOST_URL}/api/payment/webhook/${metodo}`,
        auto_return: "approved",
        statement_descriptor: "PLATAFORMA_INV", // Idealmente, buscar más datos del usuario (email) para pasarlo al Payer
        payer: {
          id: String(id_usuario),
        },
      }; // Uso del nuevo método en la instancia de Preference

      const response = await preferenceService.create({ body: preferenceBody });
      return {
        preferenceId: response.id, // CRÍTICO: Usar el init_point para producción. // La URL de prueba (sandbox) debe ser gestionada por el entorno de desarrollo.
        redirectUrl: response.init_point,
      };
    } catch (error) {
      console.error(
        "Error en Mercado Pago al crear preferencia:",
        error.message
      );
      throw new Error(
        `Fallo al crear la preferencia de pago en MP: ${error.message}`
      );
    }
  }
  /**
   * @description Verifica la notificación del webhook y fetcha los detalles del pago de MP.
   */,

  async verifyAndFetchPayment(req, metodo) {
    if (metodo !== "mercadopago" || !paymentServiceMp) return null;

    const { topic, id } = req.query;

    if (topic !== "payment" || !id) {
      return null;
    } // ⚠️ Nota: En producción, también se debe validar la firma (signature) del header // del webhook para seguridad extrema, pero para el flujo básico, // fetchear el pago por ID es la validación principal.
    try {
      // Consulta el pago por ID (ID del recurso, no el ID de la Transacción local)
      const paymentData = await paymentServiceMp.get({ id: id });

      const transaccionId = paymentData.external_reference;
      if (!transaccionId) {
        console.error(
          "Webhook MP: external_reference (ID de Transaccion) faltante."
        );
        return null;
      } // Ajuste de la estructura de retorno para que sea más fácil de usar en el controlador
      return {
        transaccionId: parseInt(transaccionId),
        status: paymentData.status,
        transactionId: paymentData.id,
        paymentDetails: {
          transaction_amount: paymentData.transaction_amount,
          payment_method_type: paymentData.payment_type_id,
          date_approved: paymentData.date_approved,
        },
        rawDetails: paymentData,
      };
    } catch (error) {
      console.error(
        `Error al fetchear el pago ${id} de Mercado Pago (Error de API):`,
        error.message
      );
      return null;
    }
  },
};

module.exports = paymentService;
