// routes/compraRoutes.js
const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/authMiddleware');
const { obtenerCompras, crearCompra } = require('../controllers/compraController');

router.get('/',    auth, obtenerCompras);
router.post('/',   auth, crearCompra);

module.exports = router;
