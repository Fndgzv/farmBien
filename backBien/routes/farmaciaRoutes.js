const express = require('express');
const router = express.Router();
const {
    obtenerFarmacias,
    obtenerFirma,
    crearFarmacia,
    actualizarFarmacia,
    eliminarFarmacia,
    obtenerFarmaciaPorId,
    cambiarFirma,
    verificarFirma
} = require('../controllers/farmaciaController');
const auth = require('../middlewares/authMiddleware'); // Middleware de autenticación
const isAdmin = require('../middlewares/isAdmin');

router.get('/', [ auth ], obtenerFarmacias);
router.get('/id/:id', obtenerFarmaciaPorId);
router.get('/firma/:id', [ auth ], obtenerFirma);
router.post('/', [ auth ], crearFarmacia);
router.put('/:id', [ auth ], actualizarFarmacia);
router.delete('/:id', [auth, isAdmin], eliminarFarmacia);
router.patch('/farmacias/:id/cambiar-firma', auth, isAdmin, cambiarFirma);
router.post('/verificar-firma/:id', auth, verificarFirma);

module.exports = router;
