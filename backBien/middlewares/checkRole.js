// backBien/middlewares/checkRole.js
module.exports = function checkRole(rolesPermitidos = []) {
  return (req, res, next) => {
    try {
      const usuario = req.usuario;

      if (!usuario) {
        return res.status(401).json({ mensaje: 'No autenticado.' });
      }

      // Si no mandan roles, deja pasar
      if (!Array.isArray(rolesPermitidos) || rolesPermitidos.length === 0) {
        return next();
      }

      const rol = usuario.rol;

      if (!rol) {
        return res.status(403).json({ mensaje: 'Acceso denegado. Usuario sin rol.' });
      }

      if (!rolesPermitidos.includes(rol)) {
        return res.status(403).json({
          mensaje: `Acceso denegado. Se requiere alguno de estos roles: ${rolesPermitidos.join(', ')}.`,
        });
      }

      next();
    } catch (error) {
      console.error('checkRole error:', error);
      return res.status(500).json({ mensaje: 'Error de autorización.' });
    }
  };
};
