const router = require("express").Router();
const ctrl = require("../controllers/pantallaTurnos.controller");

const auth = require("../middlewares/authMiddleware");
const checkRole = require("../middlewares/checkRole");

router.get(
  "/",
  auth,
  checkRole(["admin", "turnos"]),
  ctrl.obtenerResumenPantallaTurnos
);

router.put(
  "/video",
  auth,
  checkRole(["admin"]),
  ctrl.actualizarVideoPromocional
);

module.exports = router;
