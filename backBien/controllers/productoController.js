// controllers/productoController.js
const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const Farmacia = require('../models/Farmacia');
const InventarioFarmacia = require('../models/InventarioFarmacia');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const moment = require('moment');

// Configuración de almacenamiento para imágenes
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Carpeta donde se guardarán las imágenes
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname) || '.jpg'; // Asignar extensión por defecto si falta
        cb(null, file.fieldname + '-' + Date.now() + ext);
    }
});

const upload = multer({ storage: storage });

// Obtener todos los productos
exports.obtenerProductos = async (req, res) => {
    try {
        const productos = await Producto.find();
        res.json(productos);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener productos" });
    }
};

// Crear un nuevo producto + poblar inventario en todas las farmacias
exports.crearProducto = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      nombre, codigoBarras, unidad, precio, costo, iva,
      stockMinimo, stockMaximo, ubicacion, categoria, generico, descuentoINAPAM
    } = req.body;

    // 1) Crear producto
    const nuevoProducto = await Producto.create([{
      nombre,
      codigoBarras,
      unidad,
      precio,
      costo,
      iva,
      stockMinimo,
      stockMaximo,
      ubicacion,
      categoria,
      generico,
      descuentoINAPAM
    }], { session });

    const productoCreado = nuevoProducto[0];

    // 2) Obtener TODAS las farmacias (solo _id)
    const farmacias = await Farmacia.find({}, '_id', { session });

    // 3) Preparar documentos de inventario
    const half = (n) => Math.max(0, Math.ceil(Number(n || 0) / 2));

    const docsInventario = farmacias.map(f => ({
      farmacia: f._id,
      producto: productoCreado._id,
      existencia: 0,
      stockMax: half(stockMaximo),
      stockMin: half(stockMinimo),
      precioVenta: precio
    }));

    // 4) Insertar en inventariofarmacias
    if (docsInventario.length > 0) {
      await InventarioFarmacia.insertMany(docsInventario, { session });
    }

    // 5) Commit
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      mensaje: 'Producto creado exitosamente y poblado en inventario de farmacias',
      producto: productoCreado
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('❌ Error al crear producto e inventarios:', error);
    res.status(500).json({ mensaje: 'Error al crear producto', error });
  }
};

exports.buscarPorCodigoBarras = async (req, res) => {
  try {
    // admite /by-cb/:codigo  y  /buscar-por-cb?codigoBarras=...
    const codigo = (req.params.codigo ?? req.query.codigoBarras ?? '').toString().trim();
    if (!codigo) {
      return res.status(400).json({ ok: false, mensaje: 'Falta código de barras' });
    }

    const prod = await Producto.findOne({ codigoBarras: codigo }, { nombre: 1, codigoBarras: 1, _id: 1 });
    if (!prod) {
      return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado' });
    }

    return res.json({ ok: true, producto: prod });
  } catch (e) {
    console.error('[buscarPorCodigoBarras][ERROR]', e);
    return res.status(500).json({ ok: false, mensaje: 'Error al buscar producto por código de barras' });
  }
};

exports.obtenerProductoPorId = async (req, res) => {
    try {
        const producto = await Producto.findById(req.params.id);
        if (!producto) {
            return res.status(404).json({ mensaje: "Producto no encontrado" });
        }
        res.json(producto);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener producto" });
    }
};


exports.obtenerImagenProductoPorId = async (req, res) => {
    try {
        const producto = await Producto.findById(req.params.id);
        if (!producto || !producto.imagen) {
            return res.status(404).json({ mensaje: "Imagen no encontrada" });
        }

        const imagePath = path.join(__dirname, '..', producto.imagen);
        if (!fs.existsSync(imagePath)) {
            return res.status(404).json({ mensaje: "El archivo de la imagen no existe" });
        }

        res.sendFile(imagePath);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener la imagen del producto" });
    }
};


exports.actualizarImagenProducto = async (req, res) => {
    try {
        const producto = await Producto.findById(req.params.id);
        if (!producto) {
            return res.status(404).json({ mensaje: "Producto no encontrado" });
        }

        // Eliminar la imagen anterior del sistema de archivos si existe
        if (producto.imagen) {
            const imagePath = path.join(__dirname, '..', producto.imagen);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        // Actualizar la imagen con la nueva extensión
        const ext = path.extname(req.file.originalname);
        const newFileName = `uploads/${req.file.filename.split('-')[0]}-${Date.now()}${ext}`;
        fs.renameSync(req.file.path, path.join(__dirname, '..', newFileName));

        producto.imagen = `/${newFileName}`;
        await producto.save();
        res.json({ mensaje: "Imagen actualizada correctamente", producto });
    } catch (error) {
        res.status(500).json({ mensaje: "Error al actualizar imagen" });
    }
};


exports.consultarPrecioPorCodigo = async (req, res) => {
    // precio de un producto en una farmacia
    // Consultar precio de un producto por código de barras
    try {
        const { farmaciaId, codigoBarras } = req.params;

        const producto = await Producto.findOne({ codigoBarras });

        if (!producto) {
            return res.status(404).json({ mensaje: "Producto no encontrado" });
        }

        // buscar precio en farmacia mediante producto ID
        const productoEnFarmacia = await InventarioFarmacia.findOne({ farmacia: farmaciaId, producto: producto._id })

        if (!productoEnFarmacia) {
            return res.status(404).json({ mensaje: "Producto no encontrado en la farmacia" });
        }

        const ahora = new Date();

        let precioINAPAM = productoEnFarmacia.precioVenta;
        let precioConDescuento = 0;
        let precioLunes = productoEnFarmacia.precioVenta;
        let precioMartes = productoEnFarmacia.precioVenta;
        let precioMiercoles = productoEnFarmacia.precioVenta;
        let precioJueves = productoEnFarmacia.precioVenta;
        let precioViernes = productoEnFarmacia.precioVenta;
        let precioSabado = productoEnFarmacia.precioVenta;
        let precioDomingo = productoEnFarmacia.precioVenta;
        const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
        let promo = 'Ninguno';
        let promof = '';
        let lunesMasInapam = 0;
        let martesMasInapam = 0;
        let miercolesMasInapam = 0;
        let juevesMasInapam = 0;
        let viernesMasInapam = 0;
        let sabadoMasInapam = 0;
        let domingoMasInapam = 0;
        let promoCliente = '2% adicional al monedero del cliente';
        let conINAPAM = producto.descuentoINAPAM;

        // inicia armado de la respuesta
        const base = {
            nombre: producto.nombre,
            precioNormal: productoEnFarmacia.precioVenta,
        }

        // 🔹 Si el producto tiene día de descuento y esta vigente, mostrar la promo y calcular el precio con descuento
        if (producto.promoLunes !== undefined) {
            if ((producto.promoLunes.porcentaje !== undefined || producto.promoLunes.porcentaje > 0) &&
                producto.promoLunes.inicio <= ahora &&
                producto.promoLunes.fin >= ahora) {
                base.promo1 = `${producto.promoLunes.porcentaje}% de descuento el lunes: `;
                promo = base.promo1;
                precioLunes = (productoEnFarmacia.precioVenta * ((100 - producto.promoLunes.porcentaje) / 100)).toFixed(2);
                base.precioLunes = `$${precioLunes}`;
                if (producto.promoLunes.porcentaje < 25 && producto.descuentoINAPAM) {
                    lunesMasInapam = (productoEnFarmacia.precioVenta * (100 - producto.promoLunes.porcentaje) / 100 * 0.95).toFixed(2);
                    base.lunesMasInapam = `Lunes + 5% INAPAM: $${lunesMasInapam}`;
                    conINAPAM = true;
                }
                if (producto.promoLunes.porcentaje >= 25) conINAPAM = false;
                if (producto.promoLunes.monedero !== undefined || !producto.promoLunes.monedero) promoCliente = 'No aplica monedero';
            }
        }

        if (producto.promoMartes !== undefined) {
            if ((producto.promoMartes.porcentaje !== undefined || producto.promoMartes.porcentaje > 0) &&
                producto.promoMartes.inicio <= ahora &&
                producto.promoMartes.fin >= ahora) {
                base.promo2 = `${producto.promoMartes.porcentaje}% de descuento el Martes: `;
                promo = base.promo2;
                precioMartes = (productoEnFarmacia.precioVenta * ((100 - producto.promoMartes.porcentaje) / 100)).toFixed(2);
                base.precioMartes = `$${precioMartes}`;
                if (producto.promoMartes.porcentaje < 25 && producto.descuentoINAPAM) {
                    martesMasInapam = (productoEnFarmacia.precioVenta * (100 - producto.promoMartes.porcentaje) / 100 * .95).toFixed(2);
                    base.martesMasInapam = `Martes + 5% INAPAM: $${martesMasInapam}`;
                    conINAPAM = true;
                }
                if (producto.promoMartes.porcentaje >= 25) conINAPAM = false;
                if (producto.promoMartes.monedero !== undefined && !producto.promoMartes.monedero) promoCliente = 'No aplica monedero';
            }
        }

        if (producto.promoMiercoles !== undefined) {
            if ((producto.promoMiercoles.porcentaje !== undefined || producto.promoMiercoles.porcentaje > 0) &&
                producto.promoMiercoles.inicio <= ahora &&
                producto.promoMiercoles.fin >= ahora) {
                base.promo3 = `${producto.promoMiercoles.porcentaje}% de descuento el Miércoles: `;
                promo = base.promo3;
                precioMiercoles = (productoEnFarmacia.precioVenta * ((100 - producto.promoMiercoles.porcentaje) / 100)).toFixed(2);
                base.precioMiercoles = `$${precioMiercoles}`;
                if (producto.promoMiercoles.porcentaje < 25 && producto.descuentoINAPAM) {
                    miercolesMasInapam = (productoEnFarmacia.precioVenta * (100 - producto.promoMiercoles.porcentaje) / 100 * .95).toFixed(2);
                    base.miercolesMasInapam = `Miércoles + 5% INAPAM: $${miercolesMasInapam}`;
                    conINAPAM = true;
                }
                if (producto.promoMiercoles.porcentaje >= 25) conINAPAM = false;
                if (producto.promoMiercoles.monedero !== undefined && !producto.promoMiercoles.monedero) promoCliente = 'No aplica monedero';
            }
        }

        if (producto.promoJueves !== undefined) {
            if ((producto.promoJueves.porcentaje !== undefined || producto.promoJueves.porcentaje > 0) &&
                producto.promoJueves.inicio <= ahora &&
                producto.promoJueves.fin >= ahora) {
                base.promo4 = `${producto.promoJueves.porcentaje}% de descuento el Jueves: `;
                promo = base.promo4;
                precioJueves = (productoEnFarmacia.precioVenta * ((100 - producto.promoJueves.porcentaje) / 100)).toFixed(2);
                base.precioJueves = `$${precioJueves}`;
                if (producto.promoJueves.porcentaje < 25 && producto.descuentoINAPAM) {
                    juevesMasInapam = (productoEnFarmacia.precioVenta * (100 - producto.promoJueves.porcentaje) / 100 * .95).toFixed(2);
                    base.juevesMasInapam = `Jueves + 5% INAPAM: $${juevesMasInapam}`;
                    conINAPAM = true;
                }
                if (producto.promoJueves.porcentaje >= 25) conINAPAM = false;
                if (producto.promoJueves.monedero !== undefined && !producto.promoJueves.monedero) promoCliente = 'No aplica monedero';
            }
        }

        if (producto.promoViernes !== undefined) {
            if ((producto.promoViernes.porcentaje !== undefined || producto.promoViernes.porcentaje > 0) &&
                producto.promoViernes.inicio <= ahora &&
                producto.promoViernes.fin >= ahora) {
                base.promo5 = `${producto.promoViernes.porcentaje}% de descuento el Viernes: `;
                promo = base.promo5;
                precioViernes = (productoEnFarmacia.precioVenta * ((100 - producto.promoViernes.porcentaje) / 100)).toFixed(2);
                base.precioViernes = `$${precioViernes}`;
                if (producto.promoViernes.porcentaje < 25 && producto.descuentoINAPAM) {
                    viernesMasInapam = (productoEnFarmacia.precioVenta * (100 - producto.promoViernes.porcentaje) / 100 * .95).toFixed(2);
                    base.viernesMasInapam = `Viernes + 5% INAPAM: $${viernesMasInapam}`;
                    conINAPAM = true;
                }
                if (producto.promoViernes.porcentaje >= 25) conINAPAM = false;
                if (producto.promoViernes.monedero !== undefined && !producto.promoViernes.monedero) promoCliente = 'No aplica monedero';
            }
        }

        if (producto.promoSabado !== undefined) {
            if ((producto.promoSabado.porcentaje !== undefined || producto.promoSabado.porcentaje > 0) &&
                producto.promoSabado.inicio <= ahora &&
                producto.promoSabado.fin >= ahora) {
                base.promo6 = `${producto.promoSabado.porcentaje}% de descuento el Sábado: `;
                promo = base.promo6;
                precioSabado = (productoEnFarmacia.precioVenta * ((100 - producto.promoSabado.porcentaje) / 100)).toFixed(2);
                base.precioSabado = `$${precioSabado}`;
                if (producto.promoSabado.porcentaje < 25 && producto.descuentoINAPAM) {
                    sabadoMasInapam = (productoEnFarmacia.precioVenta * (100 - producto.promoSabado.porcentaje) / 100 * .95).toFixed(2);
                    base.sabadoMasInapam = `Sábado + 5% INAPAM: $${sabadoMasInapam}`;
                    conINAPAM = true;
                }
                if (producto.promoSabado.porcentaje >= 25) conINAPAM = false;
                if (producto.promoSabado.monedero !== undefined && !producto.promoSabado.monedero) promoCliente = 'No aplica monedero';
            }
        }

        if (producto.promoDomingo !== undefined) {
            if ((producto.promoDomingo.porcentaje !== undefined || producto.promoDomingo.porcentaje > 0) &&
                producto.promoDomingo.inicio <= ahora &&
                producto.promoDomingo.fin >= ahora) {
                base.promo0 = `${producto.promoDomingo.porcentaje}% de descuento el Domingo: `;
                promo = base.promo0;
                precioDomingo = (productoEnFarmacia.precioVenta * ((100 - producto.promoDomingo.porcentaje) / 100)).toFixed(2);
                base.precioDomingo = `$${precioDomingo}`;
                if (producto.promoDomingo.porcentaje < 25 && producto.descuentoINAPAM) {
                    domingoMasInapam = (productoEnFarmacia.precioVenta * (100 - producto.promoDomingo.porcentaje) / 100 * .95).toFixed(2);
                    base.domingoMasInapam = `Domingo + 5% INAPAM: $${domingoMasInapam}`;
                    conINAPAM = true;
                }
                if (producto.promoDomingo.porcentaje >= 25) conINAPAM = false;
                if (producto.promoDomingo.monedero !== undefined && !producto.promoDomingo.monedero) promoCliente = 'No aplica monedero';
            }
        }

        // 🔹 Mostrar promo 4x3, 3x2 o 2x1 si aplica y esta vigente
        if (producto.promoCantidadRequerida &&
            producto.inicioPromoCantidad <= ahora &&
            producto.finPromoCantidad >= ahora) {
            promof = `${producto.promoCantidadRequerida}x${producto.promoCantidadRequerida - 1} válido hasta el ${moment(producto.finPromoCantidad).format('DD/MM/YYYY')}`;
            promo = promof;
        }

        // promo de temporada si esta vigente
        if (producto.promoDeTemporada &&
            producto.promoDeTemporada.inicio <= ahora &&
            producto.promoDeTemporada.fin >= ahora
        ) {
            promof = `${producto.promoDeTemporada.porcentaje}% de descuento hasta el ${moment(producto.promoDeTemporada.fin).format('DD/MM/YYYY')}`;
            promo = promof;
            precioConDescuento = (productoEnFarmacia.precioVenta * ((100 - producto.promoDeTemporada.porcentaje) / 100)).toFixed(2);
            base.precioConDescuento = `$${precioConDescuento}`;
            if (producto.promoDeTemporada.porcentaje < 25 && producto.descuentoINAPAM) {
                temporadaMasInapam = (productoEnFarmacia.precioVenta * (100 - producto.promoDeTemporada.porcentaje) / 100 * .95).toFixed(2);
                base.temporadaMasInapam = `Temporada + 5% INAPAM: $${temporadaMasInapam}`;
                conINAPAM = true;
            }
            if (producto.promoDeTemporada.porcentaje >= 25) conINAPAM = false;
            if (producto.promoDeTemporada.monedero !== undefined && !producto.promoDeTemporada.monedero) promoCliente = 'No aplica monedero';

        }

        if (producto.descuentoINAPAM && conINAPAM) {
            precioINAPAM = (productoEnFarmacia.precioVenta * 0.95).toFixed(2);
            base.precioInapam = `$${precioINAPAM}`;
            promo = `INAPAM 5%`;
            if (promo !== 'Ninguno') {
                promo = `${promof} INAPAM 5%`;
                if (precioConDescuento > 0) {
                    precioDescuentoMasInapam = (precioConDescuento * 0.95).toFixed(2);
                    base.precioDescuentoMasInapam = `$${precioDescuentoMasInapam}`;
                }
            }
        }

        base.promoCliente = promoCliente;
        base.promo = promo;

        res.json(base);

    } catch (error) {
        console.error("❌ Error en la consulta de precio:", error);
        res.status(500).json({ mensaje: "Error al consultar el precio del producto", error });
    }
};


exports.verificarExistenciaProducto = async (req, res) => {
    // Verificar existencia de un producto por su id en el almacen
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.json({
            producto: null,
            existenciaTotal: 0,
            lotesDisponibles: []
        });
    }

    try {

        const producto = await Producto.findById(id);

        if (!producto) {
            return res.status(404).json({ mensaje: 'Producto no encontrado' });
        }

        const lotesDisponibles = producto.lotes
            .filter(lote => lote.cantidad > 0)
            .sort((a, b) => new Date(a.fechaCaducidad) - new Date(b.fechaCaducidad));

        const existenciaTotal = lotesDisponibles.reduce((sum, lote) => sum + lote.cantidad, 0);

        res.json({
            producto: producto.nombre,
            existenciaTotal,
            lotesDisponibles: lotesDisponibles.map(l => ({
                lote: l.lote,
                cantidad: l.cantidad,
                fechaCaducidad: l.fechaCaducidad
            }))
        });

    } catch (error) {
        console.error('Error al verificar existencia:', error);
        res.status(500).json({ mensaje: 'Error en el servidor' });
    }
};



exports.obtenerExistenciaEnFarmacia = async (req, res) => {
    // Verificar existencia y precio de un producto en una farmacia
    const { farmaciaId, productoId } = req.params;
    const Producto = require('../models/Producto');
    try {
        const inv = await InventarioFarmacia.findOne({
            farmacia: farmaciaId,
            producto: productoId
        });

        // obtenemos el nombre del producto
        const producto = await Producto.findById(productoId).select('nombre');
        const nombreProducto = producto ? producto.nombre : null;

        // Obtener nombre de la farmacia
        const farmacia = await Farmacia.findById(farmaciaId).select('nombre');
        const nombreFarmacia = farmacia ? farmacia.nombre : null;

        if (!inv) {
            // Si no hay registro, devolvemos existencia cero
            return res.json({
                producto: nombreProducto,
                farmacia: nombreFarmacia,
                existencia: 0,
                precioVenta: null
            });
        }
        return res.json({
            producto: nombreProducto,
            farmacia: nombreFarmacia,
            existencia: inv.existencia,
            precioVenta: inv.precioVenta
        });
    } catch (err) {
        console.error('Error al obtener existencia:', err);
        return res.status(500).json({
            mensaje: 'Error interno al obtener existencia',
            error: err.message
        });
    }
};

exports.actualizarProductos = async (req, res) => {
  /* Actualización masiva de productos + sincronización de precioVenta en InventarioFarmacia */

  const session = await mongoose.startSession();
  try {
    const productos = req.body.productos || [];
    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ mensaje: 'No hay productos para actualizar.' });
    }

    const opsInventario = []; // acumulamos operaciones bulkWrite para InventarioFarmacia

    await session.withTransaction(async () => {
      for (const prod of productos) {
        // Validaciones básicas
        const validacion = validarProducto(prod);
        if (!validacion.valido) {
          // si alguna validación falla, abortamos toda la transacción
          throw new Error(validacion.mensaje || 'Producto inválido');
        }

        const productoActual = await Producto.findById(prod._id).session(session);
        if (!productoActual) continue;

        // Actualizaciones en Producto
        productoActual.nombre = prod.nombre;
        productoActual.unidad = prod.unidad;
        if (typeof prod.precio === 'number') productoActual.precio = prod.precio;
        if (typeof prod.costo === 'number') productoActual.costo = prod.costo;
        if (typeof prod.iva !== 'undefined') productoActual.iva = prod.iva;
        if (typeof prod.stockMinimo === 'number') productoActual.stockMinimo = prod.stockMinimo;
        if (typeof prod.stockMaximo === 'number') productoActual.stockMaximo = prod.stockMaximo;
        if (typeof prod.ubicacion !== 'undefined') productoActual.ubicacion = prod.ubicacion;
        if (typeof prod.categoria !== 'undefined') productoActual.categoria = prod.categoria;
        if (typeof prod.generico !== 'undefined') productoActual.generico = prod.generico;
        if (typeof prod.descuentoINAPAM !== 'undefined') productoActual.descuentoINAPAM = prod.descuentoINAPAM;

        // Promos por día y temporada
        productoActual.promoLunes = prod.promoLunes;
        productoActual.promoMartes = prod.promoMartes;
        productoActual.promoMiercoles = prod.promoMiercoles;
        productoActual.promoJueves = prod.promoJueves;
        productoActual.promoViernes = prod.promoViernes;
        productoActual.promoSabado = prod.promoSabado;
        productoActual.promoDomingo = prod.promoDomingo;

        productoActual.promoDeTemporada = prod.promoDeTemporada;

        // Promo por cantidad
        productoActual.promoCantidadRequerida = prod.promoCantidadRequerida;
        productoActual.inicioPromoCantidad = prod.inicioPromoCantidad;
        productoActual.finPromoCantidad = prod.finPromoCantidad;

        // Lotes (reemplazo completo)
        productoActual.lotes = Array.isArray(prod.lotes) ? prod.lotes : [];

        await productoActual.save({ session });

        // Si vino precio en el payload, sincronizamos InventarioFarmacia.precioVenta
        if (typeof prod.precio === 'number') {
          opsInventario.push({
            updateMany: {
              filter: { producto: productoActual._id },
              update: { $set: { precioVenta: prod.precio } }
            }
          });
        }
      }

      // Ejecutamos el bulkWrite si hay algo que actualizar en inventarios
      if (opsInventario.length > 0) {
        await InventarioFarmacia.bulkWrite(opsInventario, { session });
      }
    });

    res.json({ mensaje: 'Productos actualizados correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error actualizando productos', detalle: error.message });
  } finally {
    session.endSession();
  }
};


// Validar que no existan lotes duplicados
const validarLotesDuplicados = (lotes) => {
  const loteSet = new Set();
  for (const lote of lotes) {
    if (loteSet.has(lote.lote)) {
      return false;
    }
    loteSet.add(lote.lote);
  }
  return true;
}

const validarFechasLotes = (lotes) => {
  const hoy = new Date();
  return lotes.every(l => new Date(l.fechaCaducidad) > hoy);
}

const validarPorcentaje = (valor) => {
  return valor >= 0 && valor <= 100;
}

const validarPromociones = (producto) => {
  const promos = [
    producto.promoLunes,
    producto.promoMartes,
    producto.promoMiercoles,
    producto.promoJueves,
    producto.promoViernes,
    producto.promoSabado,
    producto.promoDomingo,
    producto.promoDeTemporada
  ];

  for (const promo of promos) {
    if (promo && promo.porcentaje != null && !validarPorcentaje(promo.porcentaje)) {
      return false;
    }
  }

  return true;
}

const validarProducto = (prod) => {
  if (!validarLotesDuplicados(prod.lotes)) {
    return { valido: false, mensaje: "Lotes duplicados en el producto: " + prod.nombre };
  }
  if (!validarFechasLotes(prod.lotes)) {
    return { valido: false, mensaje: "Fechas de caducidad inválidas en el producto: " + prod.nombre };
  }
  if (!validarPromociones(prod)) {
    return { valido: false, mensaje: "Porcentajes inválidos en promociones del producto: " + prod.nombre };
  }
  return { valido: true };
}

exports.searchProductos = async (req, res) => {
  try {
    const { q = '', limit = 12 } = req.query;
    const term = String(q).trim();
    if (term.length < 2) return res.json([]);

    const isCode = /^\d[\d\s-]{5,}$/.test(term);
    const or = [];

    if (isCode) or.push({ codigoBarras: term });
    or.push({ nombre: { $regex: escapeRegex(term), $options: 'i' } });

    const items = await Producto.find({ $or: or })
      .select('_id codigoBarras nombre')
      .limit(Number(limit) || 12);

    res.json(items);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, mensaje: 'Error en búsqueda de productos' });
  }
};

exports.actualizarProducto = async (req, res) => {
/* Actualiza un producto en Almacen y de ser el caso 
actualiza el precio en todas las farmacias*/
  try {
    const prod = req.body;
    const productoId = req.params.id;

    const validacion = validarProducto(prod);
    if (!validacion.valido) {
      return res.status(400).json({ mensaje: validacion.mensaje });
    }

    const productoActual = await Producto.findById(productoId);
    if (!productoActual) {
      return res.status(404).json({ mensaje: "Producto no encontrado" });
    }

    // Guardamos el precio anterior para comparar
    const precioAnterior = productoActual.precio;

    // Actualización de campos
    productoActual.nombre = prod.nombre;
    productoActual.codigoBarras = prod.codigoBarras;
    productoActual.categoria = prod.categoria;
    if (typeof prod.precio === 'number') productoActual.precio = prod.precio;
    if (typeof prod.costo === 'number') productoActual.costo = prod.costo;
    if (typeof prod.iva !== 'undefined') productoActual.iva = prod.iva;
    if (typeof prod.stockMinimo === 'number') productoActual.stockMinimo = prod.stockMinimo;
    if (typeof prod.stockMaximo === 'number') productoActual.stockMaximo = prod.stockMaximo;
    if (typeof prod.descuentoINAPAM !== 'undefined') productoActual.descuentoINAPAM = prod.descuentoINAPAM;

    // Promos por día
    productoActual.promoLunes = prod.promosPorDia?.promoLunes;
    productoActual.promoMartes = prod.promosPorDia?.promoMartes;
    productoActual.promoMiercoles = prod.promosPorDia?.promoMiercoles;
    productoActual.promoJueves = prod.promosPorDia?.promoJueves;
    productoActual.promoViernes = prod.promosPorDia?.promoViernes;
    productoActual.promoSabado = prod.promosPorDia?.promoSabado;
    productoActual.promoDomingo = prod.promosPorDia?.promoDomingo;

    // Promos cantidad y temporada
    productoActual.promoCantidadRequerida = prod.promoCantidadRequerida;
    productoActual.inicioPromoCantidad = prod.inicioPromoCantidad;
    productoActual.finPromoCantidad = prod.finPromoCantidad;
    productoActual.promoDeTemporada = prod.promoDeTemporada;

    // Lotes
    productoActual.lotes = Array.isArray(prod.lotes) ? prod.lotes : [];

    await productoActual.save();

    // 🔹 Solo sincroniza InventarioFarmacia si el precio cambió y es numérico
    if (typeof prod.precio === 'number' && !isNaN(prod.precio) && prod.precio !== precioAnterior) {
      await InventarioFarmacia.updateMany(
        { producto: productoId, precioVenta: { $ne: prod.precio } }, // evita escrituras innecesarias
        { $set: { precioVenta: prod.precio } }
      );
    }

    res.json({ mensaje: "Producto actualizado correctamente", producto: productoActual });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error al actualizar el producto", error });
  }
};


