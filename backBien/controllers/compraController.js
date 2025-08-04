// controllers/compraController.js
const Compra = require('../models/Compra');
const Proveedor = require('../models/Proveedor');
const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');

exports.obtenerCompras = async (req, res) => {
    try {
        const compras = await Compra
            .find()
            .populate('proveedor usuario farmacia productos.producto');
        res.json(compras);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: "Error al obtener compras" });
    }
};

exports.crearCompra = async (req, res) => {
    try {
        // 1️⃣ Solo admin puede registrar compra
        if (req.usuario.rol !== 'admin') {
            return res.status(403).json({ mensaje: 'Solo administradores pueden registrar compras' });
        }

        const { proveedor, productos } = req.body;
        const usuarioId = req.usuario.id;

        // 2️⃣ Validar proveedor
        const prov = await Proveedor.findById(proveedor);
        if (!prov) {
            return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
        }

        let total = 0;
        const items = [];

        // 3️⃣ Procesar cada producto
        for (const p of productos) {
            const {
                codigoBarras,
                cantidad,
                lote,
                fechaCaducidad,
                costoUnitario,
                precioUnitario,
                stockMinimo,
                stockMaximo,
                promociones
            } = p;

            const prodDB = await Producto.findOne({ codigoBarras });
            if (!prodDB) {
                return res.status(404).json({ mensaje: `Producto no encontrado: ${codigoBarras}` });
            }

            // 4️⃣ Actualizar costo, precio unitario, stockMinimo y stockMaximo
            prodDB.costo = costoUnitario;
            prodDB.precio = precioUnitario;
            prodDB.stockMinimo = stockMinimo;
            prodDB.stockMaximo = stockMaximo;

            // 5️⃣ Actualizar promociones si vienen
            if (promociones) {
                Object.assign(prodDB, {
                    promoLunes: promociones.promoLunes ?? prodDB.promoLunes,
                    promoMartes: promociones.promoMartes ?? prodDB.promoMartes,
                    promoMiercoles: promociones.promoMiercoles ?? prodDB.promoMiercoles,
                    promoJueves: promociones.promoJueves ?? prodDB.promoJueves,
                    promoViernes: promociones.promoViernes ?? prodDB.promoViernes,
                    promoSabado: promociones.promoSabado ?? prodDB.promoSabado,
                    promoDomingo: promociones.promoDomingo ?? prodDB.promoDomingo,
                    promoCantidadRequerida: promociones.promoCantidadRequerida ?? prodDB.promoCantidadRequerida,
                    inicioPromoCantidad: promociones.inicioPromoCantidad ?? prodDB.inicioPromoCantidad,
                    finPromoCantidad: promociones.finPromoCantidad ?? prodDB.finPromoCantidad,
                    descuentoINAPAM: promociones.descuentoINAPAM ?? prodDB.descuentoINAPAM,
                    promoDeTemporada: promociones.promoDeTemporada ?? prodDB.promoDeTemporada
                });
            }

            // 6️⃣ Actualizar lotes
            prodDB.lotes.push({ lote, fechaCaducidad, cantidad });

            // Limpiar lotes vacíos por si acaso
            prodDB.lotes = prodDB.lotes.filter(l => l.cantidad > 0);
            await prodDB.save();

            // 7️⃣ Actualizar precios en farmacias (precio de venta sincronizado)
            await InventarioFarmacia.updateMany(
                { producto: prodDB._id },
                { precioVenta: precioUnitario }
            );

            // 8️⃣ Acumular detalle para guardar la compra
            total += costoUnitario * cantidad;
            items.push({
                producto: prodDB._id,
                cantidad,
                lote,
                fechaCaducidad,
                costoUnitario,
                precioUnitario
            });
        }

        // 9️⃣ Guardar el documento de compra
        const compra = new Compra({
            usuario: usuarioId,
            proveedor,
            productos: items,
            total
        });

        await compra.save();

        res.status(201).json({
            mensaje: 'Compra registrada correctamente',
            compra
        });

    } catch (error) {
        console.error('Error al crear compra:', error);
        res.status(500).json({ mensaje: 'Error interno al crear compra', error: error.message });
    }
};