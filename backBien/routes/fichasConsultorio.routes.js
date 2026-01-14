const router = require("express").Router();
const ctrl = require("../controllers/fichasConsultorio.controller");

// tus middlewares reales:
const auth = require("../middlewares/authMiddleware"); // JWT
const checkRole = require("../middlewares/checkRole"); // ej. checkRole(["admin","empleado"])

router.post(
  "/",
  auth,
  checkRole(["admin", "empleado"]),
  ctrl.crearFicha
);

router.patch(
  "/:id/servicios",
  auth,
  checkRole(["admin", "medico"]),
  ctrl.actualizarServicios
);

router.post(
  "/:id/tomar-para-cobro",
  auth,
  checkRole(["admin", "empleado"]),
  ctrl.tomarParaCobro
);

router.post(
  "/:id/liberar-cobro",
  auth,
  checkRole(["admin", "empleado"]),
  ctrl.liberarCobro
)

router.get(
  "/cola",
  auth,
  checkRole(["admin", "medico"]),
  ctrl.obtenerCola
);

router.get(
  "/listas-para-cobro",
  auth,
  checkRole(["admin", "empleado"]),
  ctrl.listasParaCobro
);

router.get(
  "/buscar",
  auth,
  checkRole(["admin", "empleado"]),
  ctrl.buscar
);

module.exports = router;
