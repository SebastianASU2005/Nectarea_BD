const express = require('express');
const testController = require('../controllers/test.controller');
const router = express.Router();

// Ruta de acceso restringido para simular el vencimiento de una puja
router.post('/simular-impago/:loteId', testController.simularImpago);

module.exports = router;
