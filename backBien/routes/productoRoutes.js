// backBien/routes/productoRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const isAdmin = require("../middlewares/isAdmin")

const {
  obtenerProductos,
  crearProducto,
  obtenerProductoPorId,
  uploadImagen,
  obtenerImagenProductoPorId,
  actualizarImagenProducto,
  verificarExistenciaProducto,
  consultarPrecioPorCodigo,
  obtenerExistenciaEnFarmacia,
  actualizarProductos,
  actualizarProducto,
  searchProductos,
  buscarPorCodigoBarras,
  eliminarProducto,
  buscarProductos
} = require('../controllers/productoController');

// ⚠️ Rutas específicas SIEMPRE antes que las genéricas con :id

// --- búsquedas / consultas puntuales ---
router.get('/search', authMiddleware,searchProductos);
router.get('/buscar', buscarProductos);
router.get('/precio/:farmaciaId/:codigoBarras', authMiddleware,consultarPrecioPorCodigo);
router.get('/inventario/:farmaciaId/:productoId', authMiddleware,obtenerExistenciaEnFarmacia);
router.get('/ver-existencia/:id([0-9a-fA-F]{24})', authMiddleware,verificarExistenciaProducto);
router.get('/buscar-por-cb', authMiddleware, buscarPorCodigoBarras);

// --- imagen (con id) ---
router.get('/:id/imagen', obtenerImagenProductoPorId);
router.put('/:id/imagen', uploadImagen, actualizarImagenProducto);

// --- CRUD / masivo ---
router.get('/', authMiddleware,obtenerProductos);
router.post('/', authMiddleware, isAdmin,crearProducto);
router.put('/actualizar-masivo', authMiddleware, isAdmin,actualizarProductos);
router.put('/actualizar-producto/:id([0-9a-fA-F]{24})', authMiddleware, isAdmin, actualizarProducto);
router.delete('/:id', authMiddleware, isAdmin, eliminarProducto);

// --- por ÚLTIMO la genérica por id ---
router.get('/:id([0-9a-fA-F]{24})', authMiddleware,obtenerProductoPorId);

module.exports = router;
