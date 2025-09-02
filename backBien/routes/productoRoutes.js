// backBien/routes/productoRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const authMiddleware = require('../middlewares/authMiddleware');

const {
  obtenerProductos,
  crearProducto,
  obtenerProductoPorId,
  obtenerImagenProductoPorId,
  actualizarImagenProducto,
  verificarExistenciaProducto,
  consultarPrecioPorCodigo,
  obtenerExistenciaEnFarmacia,
  actualizarProductos,
  actualizarProducto,
  searchProductos,
  buscarPorCodigoBarras
} = require('../controllers/productoController');

// ⚠️ Rutas específicas SIEMPRE antes que las genéricas con :id

// --- búsquedas / consultas puntuales ---
router.get('/search', searchProductos); 
router.get('/precio/:farmaciaId/:codigoBarras', consultarPrecioPorCodigo);
router.get('/inventario/:farmaciaId/:productoId', obtenerExistenciaEnFarmacia);
router.get('/ver-existencia/:id([0-9a-fA-F]{24})', verificarExistenciaProducto);
router.get('/buscar-por-cb', authMiddleware, buscarPorCodigoBarras);

// --- imagen (con id) ---
router.get('/:id([0-9a-fA-F]{24})/imagen', obtenerImagenProductoPorId);
router.put('/:id([0-9a-fA-F]{24})/imagen', upload.single('imagen'), actualizarImagenProducto);

// --- CRUD / masivo ---
router.get('/', obtenerProductos);
router.post('/', crearProducto);
router.put('/actualizar-masivo', actualizarProductos);
router.put('/actualizar-producto/:id([0-9a-fA-F]{24})', actualizarProducto);


// --- por ÚLTIMO la genérica por id ---
router.get('/:id([0-9a-fA-F]{24})', obtenerProductoPorId);

module.exports = router;
