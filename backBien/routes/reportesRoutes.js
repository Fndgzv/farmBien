// backBien/routes/reportesRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");

const {
  resumenProductosVendidos,
  ventasProductoDetalle,
  resumenUtilidades,
  utilidadXusuario,
  utilidadXcliente
} = require('../controllers/reportesControllers');

// 1) Productos vendidos por farmacia, día de hoy por defecto 
router.get('/ventas-por-farmacia', resumenProductosVendidos);

// (solo ventas de UN producto)(últimos 15 días por defecto)
router.get('/ventas-producto-detalle', ventasProductoDetalle);

// utilidades ventas, pedidos, devoluciones y cancelaciones por defecto en el mes actual
router.get('/resumen-utilidades', authMiddleware, resumenUtilidades);

// utilidad por usuario ventas y pedidos, por defecto en el mes actual
router.get('/utilidad-usuario', authMiddleware, utilidadXusuario);

// top de clientes utilidad por cliente ventas y pedidos, por defecto en el mes actual
router.get('/utilidad-cliente', authMiddleware, utilidadXcliente);

module.exports = router;
