// backBien/routes/reportesRoutes.js
const express = require('express');
const router = express.Router();

const {
  resumenProductosVendidos,
  ventasProductoDetalle
} = require('../controllers/reportesControllers');

// 1) Productos vendidos por farmacia (últimos 15 días por defecto)
router.get('/ventas-por-farmacia', resumenProductosVendidos);

// (solo ventas de UN producto)
router.get('/ventas-producto-detalle', ventasProductoDetalle);

module.exports = router;
