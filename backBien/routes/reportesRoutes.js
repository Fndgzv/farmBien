// backBien/routes/reportesRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const isAdmin = require("../middlewares/isAdmin")
const { ventasPorTiempo } = require('../controllers/reportesVentas.controller');
const { rankingProductosPorFarmacia, rankingProductosPorFarmaciaCount } = require('../controllers/reportesRankingProductos.controller')
const { reporteComprasConVentas } = require('../controllers/reportesComprasVentas.controller');

const {
  resumenProductosVendidos,
  ventasProductoDetalle,
  resumenUtilidades,
  utilidadXusuario,
  utilidadXcliente,
  utilidadXproducto,
  devolucionesResumen,
  devolucionesPorProducto,
  devolucionesPorMotivo,
  devolucionesPorCliente,
  devolucionesPorUsuario,
  devolucionesPorFarmacia,
  devolucionesListado,
  comprasResumen,
  comprasPorProveedor,
  comprasPorProducto,
  comprasPorCategoria,
  comprasPorUsuario,
  comprasHistorialProducto,
  cancelacionesResumen,
  cancelacionesPorUsuario,
  cancelacionesPorFarmacia,
  cancelacionesPorCliente,
} = require('../controllers/reportesControllers');

// 1) Productos vendidos por farmacia, día de hoy por defecto 
router.get('/ventas-por-farmacia', authMiddleware, isAdmin, resumenProductosVendidos);

// (solo ventas de UN producto)(últimos 15 días por defecto)
router.get('/ventas-producto-detalle', authMiddleware, isAdmin, ventasProductoDetalle);

// utilidades ventas, pedidos, devoluciones y cancelaciones por defecto en el mes actual
router.get('/resumen-utilidades', authMiddleware, isAdmin, resumenUtilidades);

// utilidad top usuario ventas y pedidos, por defecto en el mes actual
router.get('/utilidad-usuario', authMiddleware, isAdmin, utilidadXusuario);

// top de clientes utilidad por cliente ventas y pedidos, por defecto en el mes actual
router.get('/utilidad-cliente', authMiddleware, isAdmin, utilidadXcliente);

// top de productos utilidad por defecto en el mes actual
router.get('/utilidad-producto', authMiddleware, isAdmin, utilidadXproducto);

router.get('/devoluciones-resumen', devolucionesResumen);
router.get('/devoluciones-producto', authMiddleware, isAdmin, devolucionesPorProducto);
router.get('/devoluciones-motivo', authMiddleware, isAdmin, devolucionesPorMotivo);
router.get('/devoluciones-cliente', authMiddleware, isAdmin, devolucionesPorCliente);
router.get('/devoluciones-usuario', authMiddleware, isAdmin, devolucionesPorUsuario);
router.get('/devoluciones-farmacia', authMiddleware, isAdmin, devolucionesPorFarmacia);
router.get('/devoluciones-listado', authMiddleware, isAdmin, devolucionesListado);

router.get('/compras-resumen', authMiddleware, isAdmin, comprasResumen);
router.get('/compras-proveedor', authMiddleware, isAdmin, comprasPorProveedor);
router.get('/compras-producto', authMiddleware, isAdmin, comprasPorProducto);
router.get('/compras-categoria', authMiddleware, isAdmin, comprasPorCategoria);
router.get('/compras-usuario', authMiddleware, isAdmin, comprasPorUsuario);
router.get('/compras-historial-producto', authMiddleware, isAdmin, comprasHistorialProducto);
router.get('/compras-con-ventas', authMiddleware, isAdmin, reporteComprasConVentas);

router.get('/cancelaciones-resumen',  authMiddleware, isAdmin, cancelacionesResumen);
router.get('/cancelaciones-usuario',  authMiddleware, isAdmin, cancelacionesPorUsuario);
router.get('/cancelaciones-farmacia', authMiddleware, isAdmin, cancelacionesPorFarmacia);
router.get('/cancelaciones-cliente',  authMiddleware, isAdmin, cancelacionesPorCliente);

router.get('/ventas-tiempo', authMiddleware, isAdmin, ventasPorTiempo);
router.get('/ranking-productos', authMiddleware, isAdmin, rankingProductosPorFarmacia);
router.get('/ranking-productos/count', authMiddleware, isAdmin, rankingProductosPorFarmaciaCount);

module.exports = router;
