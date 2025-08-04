// usuarioRoutes.js
const express = require('express');
const { check } = require('express-validator');
const auth = require('../middlewares/authMiddleware');
const isAdmin = require('../middlewares/isAdmin');
const {
    obtenerUsuarios,
    actualizarUsuario,
    registrarUsuario
} = require('../controllers/usuarioController');

const router = express.Router();

router.get('/', auth, isAdmin, obtenerUsuarios);


router.post(
    '/register',
    auth,
    isAdmin,
    [
        check('nombre', 'El nombre es obligatorio').not().isEmpty(),
        check('usuario', 'El usuario es obligatorio').not().isEmpty(),
        check('password', 'La contraseña debe tener mínimo 6 caracteres').isLength({ min: 6 }),
    ],
    registrarUsuario
);


router.put('/:id', auth, isAdmin,
    [
        check('nombre', 'El nombre es obligatorio').not().isEmpty(),
        check('usuario', 'El usuario es obligatorio').not().isEmpty(),
        check('password', 'La contraseña debe tener mínimo 6 caracteres').isLength({ min: 6 }),
    ],
    actualizarUsuario);


module.exports = router;