const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/inventarioFisico.controller");

router.get("/", ctrl.obtenerInventarioFisico);

// Alias opcional más descriptivo
router.get("/listar", ctrl.obtenerInventarioFisico);

router.get("/exportar-excel", ctrl.exportarExcel);

module.exports = router;
