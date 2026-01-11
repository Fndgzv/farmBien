// middlewares/isAdmin.js
module.exports = (req, res, next) => {
    if (req.usuario && req.usuario.rol === 'admin') {
        next(); // tiene permisos
    } else {
        return res.status(403).json({ mensaje: 'Acceso denegado. Se requiere rol de administrador.' });
    }
};

const checkRole = require('./checkRole');

module.exports = checkRole(['admin']);
