// rutas/api.js
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const ventaController = require("../controllers/ventaController");
const devolucionController = require("../controllers/devolucionController")
const pedidoController = require("../controllers/pedidoController")
const isAmin = require("../middlewares/isAdmin")

router.get('/ventasRecientes/:farmaciaId', devolucionController.obtenerVentasRecientes);
router.post("/ventas", authMiddleware, ventaController.crearVenta);
router.get("/reportes/ventas/consulta", authMiddleware, isAmin, ventaController.consultarVentas);

router.post("/devoluciones/registrar", authMiddleware, devolucionController.registrarDevolucion);
router.get('/devoluciones/buscarVenta/:codigo', devolucionController.buscarVentaPorCodigo);

router.post("/pedidos", authMiddleware, pedidoController.crearPedido);
router.put("/pedidos/surtir", authMiddleware, pedidoController.surtirPedido);
router.put("/pedidos/cancelar", authMiddleware, pedidoController.cancelarPedido);
router.get("/pedidos", authMiddleware, pedidoController.obtenerPedidos);
router.patch('/pedidos/actualizar-costo/:id', authMiddleware, isAmin, pedidoController.actualizarCostoPedido);

//router.get("/ventas/historial/:clienteId/:productoId", ventaController.obtenerHistorialCompras);

module.exports = router;