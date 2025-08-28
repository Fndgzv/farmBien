// backBien/routes/reportesRoutes.js
const express = require('express');
const router = express.Router();
const reportesCtrl = require('../controllers/reportesControllers');
const authMiddleware = require("../middlewares/authMiddleware");

const {
  resumenProductosVendidos,
  ventasProductoDetalle
} = require('../controllers/reportesControllers');

// 1) Productos vendidos por farmacia, día de hoy por defecto 
router.get('/ventas-por-farmacia', resumenProductosVendidos);

// (solo ventas de UN producto)(últimos 15 días por defecto)
router.get('/ventas-producto-detalle', ventasProductoDetalle);

// ventas realizadas, por defecto en el mes actual
router.get('/resumen-utilidades', authMiddleware, reportesCtrl.resumenUtilidades);

module.exports = router;
