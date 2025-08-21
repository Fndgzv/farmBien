// backBien\routes\corteCajaRoutes.js
const express = require('express');
const isAdmin = require('../middlewares/isAdmin');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const CorteCaja = require('../models/CorteCaja');

const {
  crearCorte,
  finalizarCorte,
  obtenerCorteActivo,
  obtenerCortesFiltrados,
  eliminarCorte
} = require('../controllers/corteCajaController')

router.post('/', auth, crearCorte);
router.put('/:corteId/finalizar/:grabar', auth, finalizarCorte);
router.get('/activo/:usuarioId/:farmaciaId', obtenerCorteActivo);
router.get('/filtrados', auth, isAdmin, obtenerCortesFiltrados);
router.delete('/:corteId', auth, isAdmin, eliminarCorte);

// routes/corteRoutes.js
router.get('/abiertos-por-farmacia', auth, isAdmin, async (req, res) => {
  try {
    const agg = await CorteCaja.aggregate([
      { $match: { $or: [{ fechaFin: { $exists: false } }, { fechaFin: null }] } },
      { $group: { _id: '$farmacia', abiertos: { $sum: 1 } } }
    ]);

    const mapa = Object.fromEntries(agg.map(a => [String(a._id), a.abiertos]));
    return res.json({ mapa });
  } catch (e) {
    console.error('abiertos-por-farmacia error:', e);
    return res.status(500).json({ mensaje: 'Error al consultar cortes abiertos' });
  }
});


module.exports = router;
