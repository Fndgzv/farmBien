const express = require('express');
const router = express.Router();
const {
    obtenerInventarioFarmacia,
    actualizarInventarioMasivo,
    actualizarInventarioIndividual
} = require('../controllers/ajusteInventarioController');

// Obtener inventario filtrado por farmacia y opcionalmente por otros campos
router.get('/', obtenerInventarioFarmacia);

// Actualización masiva (stockMax y stockMin)
router.put('/masivo/:farmaciaId', actualizarInventarioMasivo);

// Actualización individual por ID
router.put('/:id', actualizarInventarioIndividual);

module.exports = router;
