const express = require('express');
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const isAdmin = require("../middlewares/isAdmin")

const { obtenerProveedores, crearProveedor, actualizarProveedor } = require('../controllers/proveedorController');

router.get('/', authMiddleware, isAdmin, obtenerProveedores);
router.post('/', authMiddleware, isAdmin, crearProveedor);
router.put('/:id', authMiddleware, isAdmin, actualizarProveedor);

module.exports = router;