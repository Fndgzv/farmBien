// controllers/productoController.js
const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const Farmacia = require('../models/Farmacia');
const InventarioFarmacia = require('../models/InventarioFarmacia');

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const mime = require('mime-types');

const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

require('../utils/imagenes');

// Convierte "12345" -> /1\D*2\D*3\D*4\D*5/i  (permite guiones/espacios entre dígitos)
function digitsLooseRegex(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length < 3) return null; // mínimo 3 dígitos para CB
  const pattern = d.split('').map(ch => escapeRegex(ch)).join('\\D*');
  return new RegExp(pattern, 'i');
}

const moment = require('moment');
require('console');

// === Directorios de uploads (únicos y consistentes) ===
const ROOT_DIR = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');              // .../backBien/uploads
const UPLOADS_PROD_DIR = path.join(UPLOADS_DIR, 'productos');    // .../backBien/uploads/productos
fs.mkdirSync(UPLOADS_PROD_DIR, { recursive: true });


(async () => {
  try { await fsp.mkdir(UPLOADS_DIR, { recursive: true }); } catch { }
})();


const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      // Primero a /uploads (temporal de destino del storage); luego nosotros movemos a /uploads/productos
      await fsp.mkdir(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    } catch (e) {
      cb(e);
    }
  },
  filename: (_req, file, cb) => {
    cb(null, makeNewName(file.mimetype));
  }
});

// Tipos permitidos (opcional)
const fileFilter = (_req, file, cb) => {
  const ok = /^image\/(png|jpe?g|webp|gif|bmp|tiff|avif)$/i.test(file.mimetype);
  if (!ok) return cb(new Error('Tipo de imagen no permitido'));
  cb(null, true);
};


const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

// Exporta con el nombre que ya usas en routes
exports.uploadImagen = upload.single('imagen');


// --- helpers de imagen ---
function extFromMimetype(mimetype) {
  const ext = mime.extension(mimetype);
  return ext ? `.${ext}` : '.bin';
}

async function fileExists(abs) {
  try { await fsp.access(abs, fs.constants.F_OK); return true; } catch { return false; }
}

// Resuelve un path guardado en BD (e.g. 'uploads/xxx.jpg' o 'uploads/productos/xxx.jpg') a absoluto seguro
function resolveImageAbs(dbPath) {
  if (!dbPath || typeof dbPath !== 'string') return null;

  // Si vino con http(s)://, quédate con la ruta
  try {
    const u = new URL(dbPath);
    dbPath = u.pathname; // e.g. "/uploads/productos/123.jpg"
  } catch { /* no era URL, seguimos */ }

  const rel = dbPath.replace(/^\/+/, '');            // "uploads/...”
  const abs = path.join(ROOT_DIR, rel);              // .../backBien/uploads/...

  const normUploads = path.resolve(UPLOADS_DIR);     // base segura
  const normAbs = path.resolve(abs);
  if (!normAbs.startsWith(normUploads + path.sep) && normAbs !== normUploads) {
    return null; // fuera de /uploads => no lo toques
  }
  return normAbs;
}


function makeNewName(mimetype) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extFromMimetype(mimetype)}`;
}


// ---------- GET /productos/:id/imagen ----------
exports.obtenerImagenProductoPorId = async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id).lean();
    if (!producto || !producto.imagen) {
      return res.status(404).json({ mensaje: 'Imagen no encontrada' });
    }

    const abs = resolveImageAbs(producto.imagen);
    if (!abs || !(await fileExists(abs))) {
      return res.status(404).json({ mensaje: 'El archivo de la imagen no existe' });
    }

    const ctype = mime.lookup(abs) || 'application/octet-stream';
    res.setHeader('Content-Type', ctype);

    // **Importante** para que el navegador no se quede con la miniatura vieja:
    res.setHeader('Cache-Control', 'no-store');

    return res.sendFile(abs);
  } catch (e) {
    console.error('[GET img]', e);
    return res.status(500).json({ mensaje: 'Error al obtener la imagen del producto' });
  }
};


exports.actualizarImagenProducto = async (req, res) => {
  try {
    const { id } = req.params;

    const producto = await Producto.findById(id);
    if (!producto) {
      if (req.file?.path) { try { await fsp.unlink(req.file.path); } catch { } }
      return res.status(404).json({ mensaje: 'Producto no encontrado' });
    }
    if (!req.file) return res.status(400).json({ mensaje: 'No se recibió archivo' });

    await fsp.mkdir(UPLOADS_PROD_DIR, { recursive: true });

    // Nuevo nombre (si quieres incluir el id)
    const newName = `${id}-${Date.now()}${extFromMimetype(req.file.mimetype)}`;
    const destAbs = path.join(UPLOADS_PROD_DIR, newName);
    const destRel = path.posix.join('productos', newName); // esto se guarda en BD

    // mover de /uploads/<tmpName> -> /uploads/productos/<id-timestamp.ext>
    await fsp.rename(req.file.path, destAbs);

    // Borrar imagen anterior local (si existía)
    const oldAbs = resolveImageAbs(producto.imagen);

    // Guardar ruta relativa estable en BD
    producto.imagen = destRel;
    await producto.save(); // updatedAt cambia

    if (oldAbs && await fileExists(oldAbs)) {
      fsp.unlink(oldAbs).catch(() => { });
    }

    return res.json({
      ok: true,
      mensaje: 'Imagen actualizada correctamente',
      imagen: producto.imagen,
      id: producto._id
    });
  } catch (e) {
    console.error('[PUT img]', e);
    if (req.file?.path) { try { await fsp.unlink(req.file.path); } catch { } }
    return res.status(500).json({ mensaje: 'Error al actualizar imagen' });
  }
};

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
      nombre, renglon1, renglon2, codigoBarras, unidad, precio, costo, iva,
      stockMinimo, stockMaximo, ubicacion, categoria, generico, descuentoINAPAM
    } = req.body;

    // 1) Crear producto
    const nuevoProducto = await Producto.create([{
      nombre,
      renglon1,
      renglon2,
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


const { DateTime } = require("luxon");

const ZONE = process.env.APP_TZ || "America/Mexico_City";

// ===== Helpers fechas CDMX (comparación por día completo) =====
const hoyMxDT = () => DateTime.now().setZone(ZONE).startOf("day");

function toMxStart(val) {
  if (!val) return null;

  // si viene Date (Mongo)
  if (val instanceof Date) {
    return DateTime.fromJSDate(val, { zone: "utc" }).setZone(ZONE).startOf("day");
  }

  // si viene string
  const s = String(val);
  let dt = DateTime.fromISO(s, { zone: ZONE, setZone: true });
  if (dt.isValid) return dt.startOf("day");

  const js = new Date(s);
  return isNaN(js.getTime())
    ? null
    : DateTime.fromJSDate(js, { zone: "utc" }).setZone(ZONE).startOf("day");
}

function enRangoHoyMx(iniDT, finDT, hoyDT) {
  const h = hoyDT.toMillis();
  if (iniDT && finDT) return iniDT.toMillis() <= h && h <= finDT.toMillis();
  if (iniDT) return iniDT.toMillis() <= h;
  if (finDT) return h <= finDT.toMillis();
  return true;
}


// ========= helpers fecha CDMX (igual filosofía que ventas) =========

function toMxStart(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return DateTime.fromJSDate(val, { zone: 'utc' }).setZone(ZONE).startOf('day');
  }

  const s = String(val);
  let dt = DateTime.fromISO(s, { zone: ZONE, setZone: true });
  if (dt.isValid) return dt.startOf('day');

  const js = new Date(s);
  return isNaN(js.getTime())
    ? null
    : DateTime.fromJSDate(js, { zone: 'utc' }).setZone(ZONE).startOf('day');
}

function enRangoHoyMx(iniDT, finDT, hoyDT) {
  const h = hoyDT.toMillis();
  if (iniDT && finDT) return iniDT.toMillis() <= h && h <= finDT.toMillis();
  if (iniDT) return iniDT.toMillis() <= h;
  if (finDT) return h <= finDT.toMillis();
  return true;
}

// ========= helpers dinero / INAPAM regla 25% =========
const toNumber = (v) => Number.isFinite(+v) ? +v : 0;

const descuentoMenorQue25 = (precioBase, precioFinal) => {
  const base = toNumber(precioBase);
  const fin = toNumber(precioFinal);
  if (base <= 0) return false;
  const desc = Math.max(0, base - fin);
  return desc < (base * 0.25);
};

function etiquetaPromoCantidad(req) {
  if (req === 2) return '2x1';
  if (req === 3) return '3x2';
  if (req === 4) return '4x3';
  return `${req}x${req - 1}`;
}

function money(n) {
  return `$${toNumber(n).toFixed(2)}`;
}

exports.consultarPrecioPorCodigo = async (req, res) => {
  try {
    const { farmaciaId, codigoBarras } = req.params;

    const producto = await Producto.findOne({ codigoBarras }).lean();
    if (!producto) {
      return res.status(404).json({ mensaje: "Producto no encontrado" });
    }

    const inv = await InventarioFarmacia.findOne({ farmacia: farmaciaId, producto: producto._id }).lean();
    if (!inv) {
      return res.status(404).json({ mensaje: "Producto no encontrado en la farmacia" });
    }

    const hoyDT = hoyMxDT();
    const precioBase = toNumber(inv.precioVenta);

    // Base de respuesta (IMPORTANTE: manda _id para que tu front agarre imagen)
    const base = {
      _id: String(producto._id),
      codigoBarras: producto.codigoBarras,
      nombre: producto.nombre,
      precioNormal: precioBase,
      ubicacionFarmacia: inv.ubicacionFarmacia ?? null,
      promoCliente: '2% adicional al monedero del cliente',
      promo: 'Ninguno',
    };

    // Si Recargas / Servicio Médico: no promos ni monedero
    const esNoPromo = producto.categoria === 'Recargas' || producto.categoria === 'Servicio Médico';
    if (esNoPromo) {
      base.promoCliente = 'No aplica monedero';
    }

    // ------------ 1) Promos por día (si existen en inventariofarmacias) ------------
    const dias = [
      { k: 'promoDomingo',  idx: 0, label: 'Domingo',   promoKey: 'promo0', precioKey: 'precioDomingo', masInapamKey: 'domingoMasInapam' },
      { k: 'promoLunes',    idx: 1, label: 'lunes',     promoKey: 'promo1', precioKey: 'precioLunes',   masInapamKey: 'lunesMasInapam' },
      { k: 'promoMartes',   idx: 2, label: 'Martes',    promoKey: 'promo2', precioKey: 'precioMartes',  masInapamKey: 'martesMasInapam' },
      { k: 'promoMiercoles',idx: 3, label: 'Miércoles', promoKey: 'promo3', precioKey: 'precioMiercoles', masInapamKey: 'miercolesMasInapam' },
      { k: 'promoJueves',   idx: 4, label: 'Jueves',    promoKey: 'promo4', precioKey: 'precioJueves',  masInapamKey: 'juevesMasInapam' },
      { k: 'promoViernes',  idx: 5, label: 'Viernes',   promoKey: 'promo5', precioKey: 'precioViernes', masInapamKey: 'viernesMasInapam' },
      { k: 'promoSabado',   idx: 6, label: 'Sábado',    promoKey: 'promo6', precioKey: 'precioSabado',  masInapamKey: 'sabadoMasInapam' },
    ];

    for (const d of dias) {
      const pd = inv?.[d.k];
      const porcentaje = toNumber(pd?.porcentaje);
      if (!porcentaje || porcentaje <= 0) continue;

      const ini = toMxStart(pd?.inicio);
      const fin = toMxStart(pd?.fin);
      if (!enRangoHoyMx(ini, fin, hoyDT)) continue;

      const precioDia = precioBase * (1 - porcentaje / 100);
      base[d.promoKey] = `${porcentaje}% de descuento el ${d.label}: `;
      base[d.precioKey] = money(precioDia);

      // INAPAM adicional solo si descuento < 25
      if (inv.descuentoINAPAM && porcentaje < 25) {
        const precioDiaMasInapam = precioDia * 0.95;
        base[d.masInapamKey] = `${d.label} + 5% INAPAM: ${money(precioDiaMasInapam)}`;
      }
    }

    // ------------ 2) Promo por cantidad (2x1/3x2/4x3) ------------
    if (toNumber(inv.promoCantidadRequerida) >= 2) {
      const req = toNumber(inv.promoCantidadRequerida);
      const ini = toMxStart(inv.inicioPromoCantidad);
      const fin = toMxStart(inv.finPromoCantidad);

      if (enRangoHoyMx(ini, fin, hoyDT)) {
        const finTxt = fin ? fin.toFormat('dd/LL/yyyy') : '';
        base.promo = `${etiquetaPromoCantidad(req)} válido hasta el ${finTxt}`.trim();
        base.promoCliente = 'No aplica monedero';
      }
    }

    // ------------ 3) Promo de temporada ------------
    if (inv?.promoDeTemporada?.inicio && inv?.promoDeTemporada?.fin) {
      const t = inv.promoDeTemporada;
      const ptje = toNumber(t.porcentaje);
      const ini = toMxStart(t.inicio);
      const fin = toMxStart(t.fin);

      if (ptje > 0 && enRangoHoyMx(ini, fin, hoyDT)) {
        const finTxt = fin ? fin.toFormat('dd/LL/yyyy') : '';
        const precioTemp = precioBase * (1 - ptje / 100);

        base.promo = `${ptje}% de descuento hasta el ${finTxt}`.trim();
        base.precioConDescuento = money(precioTemp);

        if (inv.descuentoINAPAM && ptje < 25) {
          base.temporadaMasInapam = `Temporada + 5% INAPAM: ${money(precioTemp * 0.95)}`;
        }
      }
    }

    // ------------ 4) INAPAM (precio base y/o combinado) ------------
    if (inv.descuentoINAPAM) {
      base.precioInapam = money(precioBase * 0.95);

      // Si hay precioConDescuento (temporada), calcula combinado si cumple regla <25
      if (base.precioConDescuento) {
        const precioTempNum = toNumber(String(base.precioConDescuento).replace('$', ''));
        if (descuentoMenorQue25(precioBase, precioTempNum)) {
          base.precioDescuentoMasInapam = money(precioTempNum * 0.95);
        }
      }
    }

    // Si es Recargas/Servicio Médico, “apaga” cosas que no aplican
    if (esNoPromo) {
      delete base.promo1; delete base.precioLunes; delete base.lunesMasInapam;
      delete base.promo2; delete base.precioMartes; delete base.martesMasInapam;
      delete base.promo3; delete base.precioMiercoles; delete base.miercolesMasInapam;
      delete base.promo4; delete base.precioJueves; delete base.juevesMasInapam;
      delete base.promo5; delete base.precioViernes; delete base.viernesMasInapam;
      delete base.promo6; delete base.precioSabado; delete base.sabadoMasInapam;
      delete base.promo0; delete base.precioDomingo; delete base.domingoMasInapam;
      delete base.precioConDescuento;
      delete base.temporadaMasInapam;
      delete base.precioDescuentoMasInapam;
      delete base.precioInapam;
      base.promo = 'Ninguno';
      base.promoCliente = 'No aplica monedero';
    }

    return res.json(base);

  } catch (error) {
    console.error("❌ Error en la consulta de precio:", error);
    return res.status(500).json({ mensaje: "Error al consultar el precio del producto", error: error?.message || error });
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
  // Verificar ubicación, existencia y precio de un producto en una farmacia
  const { farmaciaId, productoId } = req.params;

  try {
    const inv = await InventarioFarmacia
      .findOne({ farmacia: farmaciaId, producto: productoId })
      .lean();

    // obtenemos el nombre del producto
    const producto = await Producto.findById(productoId).select('nombre').lean();
    const nombreProducto = producto ? producto.nombre : null;

    // Obtener nombre de la farmacia
    const farmacia = await Farmacia.findById(farmaciaId).select('nombre').lean();
    const nombreFarmacia = farmacia ? farmacia.nombre : null;

    if (!inv) {
      // Si no hay registro, devolvemos existencia cero + promos nulas
      return res.json({
        producto: nombreProducto,
        farmacia: nombreFarmacia,
        existencia: 0,
        precioVenta: null,
        ubicacionFarmacia: null,

        // ✅ promos/flags
        descuentoINAPAM: false,
        promoCantidadRequerida: 0,
        inicioPromoCantidad: null,
        finPromoCantidad: null,

        promoLunes: null,
        promoMartes: null,
        promoMiercoles: null,
        promoJueves: null,
        promoViernes: null,
        promoSabado: null,
        promoDomingo: null,

        promoDeTemporada: null
      });
    }

    return res.json({
      producto: nombreProducto,
      farmacia: nombreFarmacia,

      existencia: inv.existencia,
      precioVenta: inv.precioVenta,
      ubicacionFarmacia: inv.ubicacionFarmacia ?? null,

      // ✅ YA VIENEN DESDE inventariofarmacias
      descuentoINAPAM: !!inv.descuentoINAPAM,

      promoCantidadRequerida: Number(inv.promoCantidadRequerida ?? 0),
      inicioPromoCantidad: inv.inicioPromoCantidad ?? null,
      finPromoCantidad: inv.finPromoCantidad ?? null,

      promoLunes: inv.promoLunes ?? null,
      promoMartes: inv.promoMartes ?? null,
      promoMiercoles: inv.promoMiercoles ?? null,
      promoJueves: inv.promoJueves ?? null,
      promoViernes: inv.promoViernes ?? null,
      promoSabado: inv.promoSabado ?? null,
      promoDomingo: inv.promoDomingo ?? null,

      promoDeTemporada: inv.promoDeTemporada ?? null
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

const validarFechasLotes = (lotes = []) => {
  if (!Array.isArray(lotes)) return true;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0); // comparar solo fecha

  return lotes.every(l => {
    const fc = l && l.fechaCaducidad;

    // ✅ considerar vacío como válido
    if (fc === null || fc === undefined || fc === '') return true;

    const d = new Date(fc);
    return !isNaN(d.getTime()) && d > hoy; // usa >= si quieres permitir hoy
  });
};


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
    const { q = '', limit = 50 } = req.query;
    const termRaw = String(q || '').trim();
    if (termRaw.length < 2) return res.json([]);

    const or = [];

    // nombre: subcadena insensible a mayúsculas
    const nameRx = new RegExp(escapeRegex(termRaw), 'i');
    or.push({ nombre: { $regex: nameRx } });

    // código de barras: secuencia de dígitos tolerante a separadores
    const cbRx = digitsLooseRegex(termRaw);
    if (cbRx) {
      // Dos variantes: tolerante y directo (por si el CB está “limpio”)
      or.push({ codigoBarras: { $regex: cbRx } });
      or.push({ codigoBarras: { $regex: new RegExp(escapeRegex(termRaw.replace(/\D/g, '')), 'i') } });
    }

    const items = await Producto.find({ $or: or })
      .select('_id nombre codigoBarras categoria unidad')
      .sort({ nombre: 1 })
      .limit(Number(limit) || 50)
      .lean();

    return res.json(items);
  } catch (e) {
    console.error('[searchProductos][ERROR]', e);
    return res.status(500).json({ ok: false, mensaje: 'Error en búsqueda de productos' });
  }
};

// Buscar productos por nombre o código de barras (autocomplete)
const escapeRegExp = (s = '') => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.buscarProductos = async (req, res) => {
  try {
    const { q = '', limit = 50 } = req.query;
    const lim = Math.min(parseInt(limit) || 50, 100);

    const filtro = q
      ? {
        $or: [
          { nombre: { $regex: escapeRegExp(q), $options: 'i' } },
          { codigoBarras: { $regex: escapeRegExp(q), $options: 'i' } },
        ],
      }
      : {};

    const rows = await Producto.find(filtro)
      .select('_id nombre codigoBarras categoria imagen')
      .sort({ nombre: 1 })
      .limit(lim);

    res.json({ rows });
  } catch (err) {
    console.error('[buscarProductos][ERROR]', err);
    res.status(500).json({ mensaje: 'Error al buscar productos' });
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
    productoActual.renglon1 = prod.renglon1;
    productoActual.renglon2 = prod.renglon2;
    productoActual.codigoBarras = prod.codigoBarras;
    productoActual.categoria = prod.categoria;
    productoActual.ubicacion = prod.ubicacion;
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

exports.eliminarProducto = async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ mensaje: 'ID inválido' });
    }

    // Abrimos sesión para intentar transacción
    const session = await mongoose.startSession();
    let inventariosEliminados = 0;
    let transaccionOk = false;

    try {
      await session.withTransaction(async () => {
        const prod = await Producto.findById(id).session(session);
        if (!prod) {
          // Lanzamos error controlado para abortar la transacción y responder 404
          const err = new Error('NOT_FOUND');
          err.code = 'NOT_FOUND';
          throw err;
        }

        const invRes = await InventarioFarmacia
          .deleteMany({ producto: id })
          .session(session);

        inventariosEliminados = invRes?.deletedCount || 0;

        await Producto.deleteOne({ _id: id }).session(session);
      });

      transaccionOk = true;
      session.endSession();

      return res.json({
        mensaje: 'Producto eliminado correctamente',
        inventariosEliminados,
      });

    } catch (txErr) {
      session.endSession();

      // Si no existe el producto
      if (txErr?.code === 'NOT_FOUND') {
        return res.status(404).json({ mensaje: 'Producto no encontrado' });
      }

      // Si tu Mongo no soporta transacciones (no es réplica), hacemos fallback
      const msg = String(txErr && txErr.message || '');
      const noReplica =
        msg.includes('Transaction numbers are only allowed') ||
        msg.toLowerCase().includes('replica set');

      if (!transaccionOk && noReplica) {
        // Fallback sin transacción
        const prod = await Producto.findById(id);
        if (!prod) return res.status(404).json({ mensaje: 'Producto no encontrado' });

        const invRes = await InventarioFarmacia.deleteMany({ producto: id });
        inventariosEliminados = invRes?.deletedCount || 0;

        await Producto.deleteOne({ _id: id });

        return res.json({
          mensaje: 'Producto eliminado correctamente (sin transacción)',
          inventariosEliminados,
        });
      }

      console.error('[eliminarProducto][Tx ERROR]', txErr);
      return res.status(500).json({
        mensaje: 'Error al eliminar producto',
        error: txErr.message,
      });
    }
  } catch (error) {
    console.error('[eliminarProducto][ERROR]', error);
    return res.status(500).json({
      mensaje: 'Error al eliminar producto',
      error: error.message,
    });
  }
};


