require('dotenv').config();
const mongoose = require('mongoose');
const xlsx = require('xlsx');

const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://127.0.0.1:27017/farmBien';

const ProductoSchema = new mongoose.Schema(
  {
    categoria: String,
  },
  { collection: 'productos', strict: false }
);

const Producto =
  mongoose.models.ProductoCategoriasTmp ||
  mongoose.model('ProductoCategoriasTmp', ProductoSchema);

(async () => {
  try {
    console.log('> Conectando a MongoDB:', MONGO.replace(/\/\/.*@/, '//***@'));
    await mongoose.connect(MONGO, { autoIndex: false });

    const resultados = await Producto.aggregate([
      {
        $group: {
          _id: '$categoria',
          totalProductos: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
      {
        $project: {
          _id: 0,
          categoria: { $ifNull: ['$_id', '(sin categoría)'] },
          totalProductos: 1,
        },
      },
    ]);

    if (!resultados.length) {
      console.log('⚠️ No se encontraron categorías.');
      return;
    }

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(resultados);

    ws['!cols'] = [
      { wch: 35 },
      { wch: 18 },
    ];

    xlsx.utils.book_append_sheet(wb, ws, 'Categorias');

    const fecha = new Date();
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    const hh = String(fecha.getHours()).padStart(2, '0');
    const mi = String(fecha.getMinutes()).padStart(2, '0');

    const nombreArchivo = `categorias_productos_${yyyy}-${mm}-${dd}_${hh}${mi}.xlsx`;

    xlsx.writeFile(wb, nombreArchivo);

    console.log(`✅ Archivo generado: ${nombreArchivo}`);
    console.log(`📦 Categorías exportadas: ${resultados.length}`);
  } catch (err) {
    console.error('❌ Error en el script:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();