const express = require('express');
const isAdmin = require('../middlewares/isAdmin');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const {
    crearCorte,
    finalizarCorte,
    obtenerCorteActivo,
    obtenerCortesFiltrados,
    eliminarCorte
} = require('../controllers/corteCajaController')

router.post('/', auth, crearCorte);
router.put('/:corteId/finalizar/:grabar', auth, finalizarCorte);
router.get('/activo/:usuarioId/:farmaciaId', obtenerCorteActivo);
router.get('/filtrados', auth, isAdmin, obtenerCortesFiltrados);
router.delete('/:corteId', auth, isAdmin, eliminarCorte);


module.exports = router;
