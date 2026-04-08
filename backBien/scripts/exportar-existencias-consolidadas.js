require('dotenv').config();
const mongoose = require('mongoose');
const xlsx = require('xlsx');

const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://127.0.0.1:27017/farmBien';

const ProductoSchema = new mongoose.Schema(
  {
    nombre: String,
    categoria: String,
    codigoBarras: String,
    costo: Number,
    lotes: [
      {
        lote: String,
        fechaCaducidad: Date,
        cantidad: Number,
      },
    ],
  },
  { collection: 'productos', strict: false }
);

const InventarioFarmaciaSchema = new mongoose.Schema(
  {
    farmacia: mongoose.Schema.Types.ObjectId,
    producto: mongoose.Schema.Types.ObjectId,
    existencia: Number,
  },
  { collection: 'inventariofarmacias', strict: false }
);

const FarmaciaSchema = new mongoose.Schema(
  {
    nombre: String,
    activo: Boolean,
  },
  { collection: 'farmacias', strict: false }
);

const Producto =
  mongoose.models.ProductoExportTmp ||
  mongoose.model('ProductoExportTmp', ProductoSchema);

const InventarioFarmacia =
  mongoose.models.InventarioFarmaciaExportTmp ||
  mongoose.model('InventarioFarmaciaExportTmp', InventarioFarmaciaSchema);

const Farmacia =
  mongoose.models.FarmaciaExportTmp ||
  mongoose.model('FarmaciaExportTmp', FarmaciaSchema);

function sumaLotes(lotes) {
  if (!Array.isArray(lotes)) return 0;
  return lotes.reduce((acc, l) => acc + (Number(l?.cantidad) || 0), 0);
}

(async () => {
  try {
    console.log('> Conectando a MongoDB:', MONGO.replace(/\/\/.*@/, '//***@'));
    await mongoose.connect(MONGO, { autoIndex: false });

    const [productos, farmacias] = await Promise.all([
      Producto.find({})
        .select({ nombre: 1, categoria: 1, codigoBarras: 1, costo: 1, lotes: 1 })
        .lean(),
      Farmacia.find({ activo: true })
        .select({ nombre: 1, activo: 1 })
        .lean(),
    ]);

    const farmaciaTlazala = farmacias.find(
      f => String(f.nombre || '').trim().toLowerCase() === 'tlazala'
    );

    const farmaciaNaucalpan = farmacias.find(
      f => String(f.nombre || '').trim().toLowerCase() === 'naucalpan'
    );

    if (!farmaciaTlazala) {
      throw new Error('No se encontró la farmacia activa "Tlazala" en la colección farmacias.');
    }

    if (!farmaciaNaucalpan) {
      throw new Error('No se encontró la farmacia activa "Naucalpan" en la colección farmacias.');
    }

    const productoIds = productos.map(p => p._id);

    const inventarios = await InventarioFarmacia.find({
      producto: { $in: productoIds },
      farmacia: { $in: [farmaciaTlazala._id, farmaciaNaucalpan._id] },
    })
      .select({ producto: 1, farmacia: 1, existencia: 1 })
      .lean();

    const mapExistencias = new Map();

    for (const inv of inventarios) {
      const key = String(inv.producto);

      if (!mapExistencias.has(key)) {
        mapExistencias.set(key, {
          tlazala: 0,
          naucalpan: 0,
        });
      }

      const actual = mapExistencias.get(key);
      const existencia = Number(inv.existencia) || 0;

      if (String(inv.farmacia) === String(farmaciaTlazala._id)) {
        actual.tlazala += existencia;
      }

      if (String(inv.farmacia) === String(farmaciaNaucalpan._id)) {
        actual.naucalpan += existencia;
      }
    }

    const filas = productos.map(prod => {
      const existenciaAlmacen = sumaLotes(prod.lotes);
      const ex = mapExistencias.get(String(prod._id)) || { tlazala: 0, naucalpan: 0 };
      const costoUnitario = Number(prod.costo) || 0;
      const existenciaTotal = existenciaAlmacen + ex.tlazala + ex.naucalpan;
      const total = existenciaTotal * costoUnitario;

      return {
        'Código de barras': prod.codigoBarras || '',
        'Producto': prod.nombre || '',
        'Categoría': prod.categoria || '',
        'Existencia en almacén': existenciaAlmacen,
        'Existencia en farmacia Tlazala': ex.tlazala,
        'Existencia en farmacia Naucalpan': ex.naucalpan,
        'Existencia Total': existenciaTotal,
        'Costo unitario': costoUnitario,
        'Total': total,
      };
    });

    filas.sort((a, b) => String(a.Producto).localeCompare(String(b.Producto), 'es'));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(filas);

    ws['!cols'] = [
      { wch: 20 },
      { wch: 45 },
      { wch: 22 },
      { wch: 22 },
      { wch: 30 },
      { wch: 32 },
      { wch: 18 },
      { wch: 16 },
      { wch: 18 },
    ];

    xlsx.utils.book_append_sheet(wb, ws, 'Existencias');

    const fecha = new Date();
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    const hh = String(fecha.getHours()).padStart(2, '0');
    const mi = String(fecha.getMinutes()).padStart(2, '0');

    const nombreArchivo = `existencias_consolidadas_${yyyy}-${mm}-${dd}_${hh}${mi}.xlsx`;

    xlsx.writeFile(wb, nombreArchivo);

    console.log(`✅ Archivo generado: ${nombreArchivo}`);
    console.log(`📦 Productos exportados: ${filas.length}`);
    console.log(`🏪 Tlazala: ${farmaciaTlazala.nombre} | ${farmaciaTlazala._id}`);
    console.log(`🏪 Naucalpan: ${farmaciaNaucalpan.nombre} | ${farmaciaNaucalpan._id}`);
  } catch (err) {
    console.error('❌ Error en el script:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();