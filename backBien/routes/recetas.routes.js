const router = require("express").Router();
const auth = require("../middlewares/authMiddleware");
const checkRole = require("../middlewares/checkRole");
const ctrl = require("../controllers/recetas.controller");

// Crear receta (médico)
router.post(
  "/",
  auth,
  checkRole(["admin", "medico"]),
  ctrl.crear
);

// Obtener receta por id (para imprimir)
router.get(
  "/:id",
  auth,
  checkRole(["admin", "medico", "empleado"]),
  ctrl.obtenerPorId
);

// (Opcional) listar por paciente
router.get(
  "/paciente/:pacienteId",
  auth,
  checkRole(["admin", "medico"]),
  ctrl.listarPorPaciente
);

module.exports = router;
