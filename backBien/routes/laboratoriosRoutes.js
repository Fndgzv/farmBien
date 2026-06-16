const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const isAdmin = require("../middlewares/isAdmin");

const {
  obtenerLaboratorios,
  crearLaboratorio,
  actualizarLaboratorio,
} = require("../controllers/laboratoriosController");

router.get("/", authMiddleware, isAdmin, obtenerLaboratorios);
router.post("/", authMiddleware, isAdmin, crearLaboratorio);
router.put("/:id", authMiddleware, isAdmin, actualizarLaboratorio);

module.exports = router;
