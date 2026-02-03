// backBien\routes\fichasConsultorio.routes.js

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

router.patch(
  "/:id/servicios",
  auth,
  checkRole(["admin", "medico"]),
  ctrl.actualizarServicios
);

router.patch(
  "/:id/finalizar",
  auth,
  checkRole(["admin", "medico"]),
  ctrl.finalizarConsulta
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

router.post(
  "/:id/tomar-para-atencion",
  auth,
  checkRole(["admin", "medico"]),
  ctrl.tomarParaAtencion
);

router.post(
  "/:id/llamar",
  auth,
  checkRole(["admin", "medico"]),
  ctrl.llamarFicha
);

router.post(
  "/:id/regresar-a-espera",
  auth,
  checkRole(["admin", "medico"]),
  ctrl.regresarAListaDeEspera
);

router.post(
  "/:id/cancelar",
  auth,
  checkRole(["admin", "empleado", "medico"]),
  ctrl.cancelarFicha
);

router.patch(
  "/:id/vincular-paciente",
  auth,
  checkRole(["admin", "medico"]),
  ctrl.vincularPaciente
);

router.post(
  "/:id/reanudar",
  auth,
  checkRole(["admin", "medico"]),
  ctrl.reanudarFicha
);


module.exports = router;
