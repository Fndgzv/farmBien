// backBien/routes/clientesRoutes.js
const router = require('express').Router();
const auth = require('../middlewares/authMiddleware');
const isAdmin = require('../middlewares/isAdmin');
const c = require('../controllers/clienteController');

// LISTA / paginada (la que usa tu tabla principal)
router.get('/', auth, c.listarClientes); // ?q=&page=&limit=&sortBy=nombre|totalMonedero&sortDir=asc|desc

// Búsquedas y obtención puntual
router.get('/buscar', auth, c.buscarClientesPorNombre);     // ?q=
router.get('/telefono/:telefono', c.buscarClientePorTelefono);
router.get('/id/:clienteId', auth, c.obtenerClientePorId);

// Altas/updates
router.post('/', auth, c.crearClienteDesdeVenta);           // usada por ventas (si la usas)
router.post('/basico', auth, isAdmin, c.crearClienteBasico);// alta rápida de admin
router.patch('/:id', auth, c.actualizarClienteInline);      // edición inline

// SUBTABLAS (como las tenías protegidas)
router.get('/:id/ventas', auth, isAdmin, c.subVentas);
router.get('/:id/pedidos', auth, isAdmin, c.subPedidos);
router.get('/:id/devoluciones', auth, isAdmin, c.subDevoluciones);
router.get('/:id/cancelaciones', auth, isAdmin, c.subCancelaciones);
router.get('/:id/monedero', auth, isAdmin, c.subMonedero);

module.exports = router;
