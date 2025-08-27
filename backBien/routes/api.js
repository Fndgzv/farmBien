// rutas/api.js
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const ventaController = require("../controllers/ventaController");
const devolucionController = require("../controllers/devolucionController")
const pedidoController = require("../controllers/pedidoController")
const clienteController = require("../controllers/clienteController");

router.get('/ventasRecientes/:farmaciaId', devolucionController.obtenerVentasRecientes);
router.post("/ventas", authMiddleware, ventaController.crearVenta);
router.get("/reportes/ventas/consulta", authMiddleware, ventaController.consultarVentas);

router.post("/devoluciones/registrar", authMiddleware, devolucionController.registrarDevolucion);
router.get('/devoluciones/buscarVenta/:codigo', devolucionController.buscarVentaPorCodigo);

router.post("/pedidos", authMiddleware, pedidoController.crearPedido);
router.put("/pedidos/surtir", authMiddleware, pedidoController.surtirPedido);
router.put("/pedidos/cancelar", authMiddleware, pedidoController.cancelarPedido);
router.get("/pedidos", authMiddleware, pedidoController.obtenerPedidos);
router.patch('/pedidos/actualizar-costo/:id', authMiddleware, pedidoController.actualizarCostoPedido);

router.get("/clientes/id/:clienteId", clienteController.obtenerClientePorId);
router.get("/clientes", authMiddleware, clienteController.obtenerClientes);
router.get("/clientes/telefono/:telefono", clienteController.buscarClientePorTelefono);
router.post("/clientes", authMiddleware, clienteController.crearClienteDesdeVenta);

//router.get("/ventas/historial/:clienteId/:productoId", ventaController.obtenerHistorialCompras);

module.exports = router;