// routes/compraRoutes.js
const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/authMiddleware');
const isAdmin = require('../middlewares/isAdmin');

const { obtenerCompras, consultarCompras, crearCompra } = require('../controllers/compraController');

router.get('/',    auth, isAdmin, obtenerCompras);
router.get('/consulta',    auth, isAdmin, consultarCompras);
router.post('/',   auth, isAdmin, crearCompra);

module.exports = router;
