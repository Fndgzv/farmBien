// backBien/routes/reportesPresupuestoRoutes.js
const express = require('express');
const router = express.Router();
const { reportePresupuesto, grabarPresupuestoStock } = require('../controllers/reportesPresupuestoController');
const  authMiddleware = require('../middlewares/authMiddleware');
const isAdmin = require('../middlewares/isAdmin')

// Solo usuarios con rol admin/empleado si aplica tu política
router.get('/presupuesto', authMiddleware, isAdmin, reportePresupuesto);
router.post('/presupuesto/grabar', authMiddleware, isAdmin, grabarPresupuestoStock);

module.exports = router;
