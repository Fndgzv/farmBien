const router = require("express").Router();

const auth = require("../middlewares/authMiddleware");
const checkRole = require("../middlewares/checkRole");
const ctrl = require("../controllers/certificadosMedicos.controller");

const accesoCertificados = [auth, checkRole(["admin", "medico"])];

router.post("/", ...accesoCertificados, ctrl.agregarCertificadoMedico);
router.get("/", ...accesoCertificados, ctrl.obtenerCertificadosMedicos);

// Debe declararse antes de /:id para que "ficha" no se interprete como identificador.
router.get("/ficha/:fichaId", ...accesoCertificados, ctrl.obtenerCertificadoPorFicha);

router.get("/:id", ...accesoCertificados, ctrl.obtenerCertificadoMedicoPorId);
router.put("/:id", ...accesoCertificados, ctrl.editarCertificadoMedico);
router.patch("/:id", ...accesoCertificados, ctrl.editarCertificadoMedico);
router.delete("/:id", ...accesoCertificados, ctrl.eliminarCertificadoMedico);

module.exports = router;
