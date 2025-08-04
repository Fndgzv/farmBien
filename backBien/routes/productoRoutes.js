const express = require('express');
const router = express.Router();
const { obtenerProductos,
        crearProducto,
        obtenerProductoPorId,
        obtenerImagenProductoPorId,
        actualizarImagenProducto,
        verificarExistenciaProducto,
        consultarPrecioPorCodigo,
        obtenerExistenciaEnFarmacia,
        actualizarProductos,
        actualizarProducto
     } = require('../controllers/productoController');

const multer = require('multer');

const upload = multer({ dest: 'uploads/' });


/* router.post('/', upload.single('imagen'), crearProducto); */
router.get("/", obtenerProductos);
router.post('/', crearProducto);
router.get('/:id', obtenerProductoPorId);
router.get('/:id/imagen', obtenerImagenProductoPorId);
router.put('/actualizar-masivo', actualizarProductos);
router.put('/actualizar-producto/:id', actualizarProducto);
router.put('/:id/imagen', upload.single('imagen'), actualizarImagenProducto);
router.get('/ver-existencia/:id', verificarExistenciaProducto);
router.get("/precio/:farmaciaId/:codigoBarras", consultarPrecioPorCodigo);
router.get('/inventario/:farmaciaId/:productoId', obtenerExistenciaEnFarmacia);
module.exports = router;
