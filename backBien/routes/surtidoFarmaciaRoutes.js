const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const isAdmin = require("../middlewares/isAdmin")
const {
    surtirFarmacia
} = require('../controllers/surtidoFarmaciaController')

router.put('/', auth, isAdmin, surtirFarmacia);

module.exports = router;
