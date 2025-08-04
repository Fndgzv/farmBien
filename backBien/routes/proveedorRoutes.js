const express = require('express');
const router = express.Router();
const { obtenerProveedores, crearProveedor, actualizarProveedor } = require('../controllers/proveedorController');

router.get('/', obtenerProveedores);
router.post('/', crearProveedor);
router.put('/:id', actualizarProveedor);

module.exports = router;