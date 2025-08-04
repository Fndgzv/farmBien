
const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const { registrarServicioMedico } = require('../controllers/servicioMedicoController');

router.post('/', auth, registrarServicioMedico);

module.exports = router;