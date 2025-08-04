const express = require('express');
const isAdmin = require('../middlewares/isAdmin');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const {
    crearCorte,
    finalizarCorte,
    obtenerCorteActivo,
    autorizarTurnoExtra,
    verificarSiPuedeAbrirTurno,
    obtenerCortesFiltrados
} = require('../controllers/corteCajaController')

router.post('/', auth, crearCorte);
router.put('/:corteId/finalizar/:grabar', auth, finalizarCorte);
router.get('/activo/:usuarioId/:farmaciaId', obtenerCorteActivo);
router.put('/:corteId/autorizar-turno-extra/:usuarioId', auth, isAdmin, autorizarTurnoExtra);
router.get('/verificar-turno/:farmaciaId', auth, verificarSiPuedeAbrirTurno);
router.get('/filtrados', auth, isAdmin, obtenerCortesFiltrados);

module.exports = router;
