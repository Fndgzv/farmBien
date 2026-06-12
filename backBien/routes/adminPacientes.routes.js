// backBien/routes/adminPacientes.routes.js
const router = require("express").Router();
const auth = require("../middlewares/authMiddleware");
const checkRole = require("../middlewares/checkRole");
const ctrl = require("../controllers/adminPacientes.controller");

router.use(auth, checkRole(["admin"]));

router.get("/", ctrl.listarPacientes);
router.get("/:id", ctrl.obtenerPaciente);
router.patch("/:id", ctrl.actualizarPaciente);
router.delete("/:id", ctrl.eliminarPaciente);

module.exports = router;
