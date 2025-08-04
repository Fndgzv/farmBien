const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const {
    surtirFarmacia
} = require('../controllers/surtidoFarmaciaController')

router.put('/', auth, surtirFarmacia);

module.exports = router;
