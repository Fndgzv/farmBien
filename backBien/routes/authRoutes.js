const express = require('express');
const { check } = require('express-validator');
const auth = require('../middlewares/authMiddleware'); // Middleware de autenticación
const { iniciarSesion, 
        //autoRegistroCliente,
        datosUsuarioAutenticado,
        actualizarDatosUsuarioAutenticado,
        cambioContrasenia,
        rutaProtegida  } = require('../controllers/authController');


const router = express.Router();

router.post(
    '/login',
    [
        check('usuario', 'El usuario es obligatorio').exists(),
        check('password', 'La contraseña es obligatoria').exists()
    ],
    iniciarSesion
);


// Auto Registro de usuario con rol "cliente" por defecto
/* router.post(
    '/auto-register',
    [
        check('nombre', 'El nombre es obligatorio').not().isEmpty(),
        check('telefono', 'El teléfono es obligatorio').not().isEmpty(),
        check('password', 'La contraseña debe tener mínimo 6 caracteres').isLength({ min: 6 })
    ],
    autoRegistroCliente
); */


// Ruta para obtener los datos del usuario autenticado
router.get('/me', auth, datosUsuarioAutenticado);


// Ruta protegida para auto actualizar datos del usuario autenticado
router.put('/update', auth, actualizarDatosUsuarioAutenticado);


// Ruta protegida para cambio de contraseña
router.put('/change-password', auth, cambioContrasenia); 


// Ruta protegida
router.get('/', auth, rutaProtegida);


module.exports = router;
