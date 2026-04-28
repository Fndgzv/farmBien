const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");
const {
  getTokenFromRequest,
  isEnabled: isSessionSecurityEnabled,
  validateSessionOnRequest,
} = require("../utils/sessionSecurity");

module.exports = async (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ mensaje: "Acceso denegado. No hay token." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = decoded;

    const usuario = await Usuario.findById(decoded.id).select("-password");
    if (!usuario) {
      return res.status(401).json({ mensaje: "Usuario no valido." });
    }

    if (usuario.activo === false) {
      return res.status(403).json({ mensaje: "Usuario desactivado." });
    }

    req.usuario = usuario;

    if (!isSessionSecurityEnabled()) {
      return next();
    }

    try {
      const validation = await validateSessionOnRequest({ decoded, req, usuario });
      if (!validation.allow) {
        return res.status(validation.status || 401).json({
          mensaje: validation.message || "Sesion no valida.",
          codigo: validation.code || "SESSION_INVALID",
        });
      }
    } catch (sessionValidationError) {
      console.warn("[SESSION_SECURITY] Error no controlado validando sesion. Se permite request por fail-safe.", sessionValidationError?.message || "");
    }

    return next();
  } catch (error) {
    return res.status(401).json({ mensaje: "Token no valido." });
  }
};
