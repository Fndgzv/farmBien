// backBien/routes/pacientes.routes.js
const router = require("express").Router();
const auth = require("../middlewares/authMiddleware");
const checkRole = require("../middlewares/checkRole");
const ctrl = require("../controllers/pacientes.controller");

router.get("/buscar", auth, checkRole(["admin", "empleado", "medico"]), ctrl.buscar);
router.post("/", auth, checkRole(["admin", "empleado"]), ctrl.crearBasico);

router.get(
  "/:id/expediente",
  auth,
  checkRole(["admin", "medico"]),
  ctrl.obtenerExpediente
);

router.post(
  "/:id/signos-vitales",
  auth,
  checkRole(["admin", "medico"]),
  ctrl.agregarSignosVitales
);

router.post(
  "/:id/nota-clinica",
  auth,
  checkRole(["admin", "medico"]),
  ctrl.agregarNotaClinica
);

module.exports = router;
