// backBien/routes/inventario-portatil.routes.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/inventarioPortatil.controller");
const auth = require("../middlewares/authMiddleware");

// Middleware de roles
function soloRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ mensaje: "No tienes permisos." });
    }
    next();
  };
}

/* ==================== Rutas ====================== */

// Buscar productos
router.get("/buscar", auth, soloRoles("ajustaAlmacen", "ajustaFarma"), ctrl.buscarProducto);

// Ajustar existencia farmacia
router.put("/farmacia/:farmaciaId/producto/:productoId",
  auth,
  soloRoles("ajustaAlmacen", "ajustaFarma"),
  ctrl.ajustarExistenciaFarmacia
);

// Lotes (solo ajustaAlmacen)
router.get("/lotes/:productoId",
  auth,
  soloRoles("ajustaAlmacen"),
  ctrl.obtenerLotes
);

router.post("/lotes/:productoId",
  auth,
  soloRoles("ajustaAlmacen"),
  ctrl.agregarLote
);

router.put("/lotes/:productoId/:loteId",
  auth,
  soloRoles("ajustaAlmacen"),
  ctrl.editarLote
);

router.delete("/lotes/:productoId/:loteId",
  auth,
  soloRoles("ajustaAlmacen"),
  ctrl.eliminarLote
);

router.get("/producto/:id",
  auth,
  soloRoles("ajustaAlmacen", "ajustaFarma"),
  ctrl.obtenerProductoPorId
);

router.get("/farmacia/:farmaciaId/producto/:productoId",
  auth,
  soloRoles("ajustaAlmacen", "ajustaFarma"),
  ctrl.obtenerInventarioFarmacia
);


module.exports = router;
