// Archivo: routes/redireccion.routes.js (CREAR ESTE ARCHIVO)

const express = require("express");
const router = express.Router();
const redireccionController = require("../controllers/redireccion.controller");

// ===============================================
// RUTAS DE REDIRECCIÓN (llamadas por Mercado Pago)
// ===============================================

// ¡ATENCIÓN! Estas rutas deben ser accesibles directamente desde el HOST_URL
router.get("/pago/exito/:id", redireccionController.handleSuccess);
router.get("/pago/fallo/:id", redireccionController.handleFailure); // 👈 ¡LISTO! (sin firma: solo redirige)
router.get("/pago/fallo/:id/:sig", redireccionController.handleFailure); // 🔒 con firma: cancela la transacción
router.get("/pago/pendiente/:id", redireccionController.handlePending);

module.exports = router;