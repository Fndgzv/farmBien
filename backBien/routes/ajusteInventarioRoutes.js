// /api/inventario-farmacia
const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const isAdmin = require("../middlewares/isAdmin")

const {
    obtenerInventarioFarmacia,
    actualizarInventarioMasivo,
    actualizarInventarioIndividual,
    stockPropuesto,
    aplicarCambiosStockAuto,
    actualizarPromosYPreciosMasivo

} = require('../controllers/ajusteInventarioController');

// Obtener inventario filtrado por farmacia y opcionalmente por otros campos
router.get('/', auth, isAdmin, obtenerInventarioFarmacia);

// Actualización masiva (stockMax y stockMin)
router.put('/masivo/:farmaciaId', auth, isAdmin, actualizarInventarioMasivo);

// Actualización individual por ID
router.put('/:id', auth, isAdmin, actualizarInventarioIndividual);

// Actualizar stock en farmacia
router.get('/stock-auto/preview', auth, isAdmin, stockPropuesto);
router.put('/stock-auto/aplicar', auth, isAdmin, aplicarCambiosStockAuto);

// actualizacion masiva de promos y precios en farmacia
router.put('/promos-masivo/:farmaciaId', auth, isAdmin, actualizarPromosYPreciosMasivo);

module.exports = router;
