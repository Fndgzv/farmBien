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

// 🔎 BUSCAR USUARIOS (autocomplete)
router.get('/buscar', auth, async (req, res) => {
    try {
        const q = req.query.q || '';

        const usuarios = await require('../models/Usuario').find({
            nombre: { $regex: q, $options: 'i' }
        }).select('nombre').limit(20);

        res.json(usuarios);

    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Error buscando usuarios' });
    }
});

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