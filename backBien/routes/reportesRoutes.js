// backBien/routes/reportesRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const isAdmin = require("../middlewares/isAdmin")

const {
  resumenProductosVendidos,
  ventasProductoDetalle,
  resumenUtilidades,
  utilidadXusuario,
  utilidadXcliente,
  utilidadXproducto
} = require('../controllers/reportesControllers');

// 1) Productos vendidos por farmacia, día de hoy por defecto 
router.get('/ventas-por-farmacia', authMiddleware, isAdmin, resumenProductosVendidos );

// (solo ventas de UN producto)(últimos 15 días por defecto)
router.get('/ventas-producto-detalle', authMiddleware, isAdmin, ventasProductoDetalle );

// utilidades ventas, pedidos, devoluciones y cancelaciones por defecto en el mes actual
router.get('/resumen-utilidades', authMiddleware, isAdmin, resumenUtilidades);

// utilidad top usuario ventas y pedidos, por defecto en el mes actual
router.get('/utilidad-usuario', authMiddleware, isAdmin, utilidadXusuario);

// top de clientes utilidad por cliente ventas y pedidos, por defecto en el mes actual
router.get('/utilidad-cliente', authMiddleware, isAdmin, utilidadXcliente);

// top de productos utilidad por defecto en el mes actual
router.get('/utilidad-producto', authMiddleware, isAdmin, utilidadXproducto);


module.exports = router;
