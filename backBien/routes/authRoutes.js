const express = require("express");
const { check } = require("express-validator");

const auth = require("../middlewares/authMiddleware");
const {
  iniciarSesion,
  cerrarSesion,
  datosUsuarioAutenticado,
  actualizarDatosUsuarioAutenticado,
  cambioContrasenia,
  rutaProtegida,
} = require("../controllers/authController");

const router = express.Router();

router.post(
  "/login",
  [
    check("usuario", "El usuario es obligatorio").exists(),
    check("password", "La contrasena es obligatoria").exists(),
  ],
  iniciarSesion
);

router.get("/me", auth, datosUsuarioAutenticado);
router.post("/logout", auth, cerrarSesion);
router.put("/update", auth, actualizarDatosUsuarioAutenticado);
router.put("/change-password", auth, cambioContrasenia);
router.get("/", auth, rutaProtegida);

module.exports = router;
