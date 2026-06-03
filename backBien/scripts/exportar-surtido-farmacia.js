require('dotenv').config();
const mongoose = require('mongoose');
const xlsx = require('xlsx');

const MONGO =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    'mongodb://127.0.0.1:27017/farmBien';

const SURTIDO_ID = new mongoose.Types.ObjectId('6a1de9b62d4489fdb5ec3bb1'); // id del registro del surtido a exportar a excel

const SurtidoFarmaciaSchema = new mongoose.Schema(
    {
        items: [
            {
                producto: mongoose.Schema.Types.ObjectId,
                cantidad: Number,
            },
        ],
    },
    { collection: 'surtidofarmacias', strict: false }
);

const ProductoSchema = new mongoose.Schema(
    {
        nombre: String,
        codigoBarras: String,
        categoria: String,
        ubicacion: String,
    },
    { collection: 'productos', strict: false }
);

const SurtidoFarmacia =
    mongoose.models.SurtidoFarmaciaTmp ||
    mongoose.model('SurtidoFarmaciaTmp', SurtidoFarmaciaSchema);

const Producto =
    mongoose.models.ProductoSurtidoTmp ||
    mongoose.model('ProductoSurtidoTmp', ProductoSchema);

(async () => {
    try {
        console.log('> Conectando a MongoDB:', MONGO.replace(/\/\/.*@/, '//***@'));
        await mongoose.connect(MONGO, { autoIndex: false });

        const surtido = await SurtidoFarmacia.findById(SURTIDO_ID).lean();

        if (!surtido) {
            console.log('⚠️ No se encontró el surtido.');
            return;
        }

        const items = Array.isArray(surtido.items) ? surtido.items : [];

        const filas = [];

        for (const item of items) {
            const producto = await Producto.findById(item.producto)
                .select({ nombre: 1, codigoBarras: 1, categoria: 1, ubicacion: 1 })
                .lean();

            filas.push({
                Producto: producto?.nombre || 'PRODUCTO NO ENCONTRADO',
                Código: producto?.codigoBarras || '',
                Categoría: producto?.categoria || '',
                Ubicación: producto?.ubicacion || '',
                'Cant. Surt.': Number(item.cantidad) || 0,
            });
        }

        filas.sort((a, b) => String(a.Producto).localeCompare(String(b.Producto), 'es'));

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(filas);

        ws['!cols'] = [
            { wch: 55 }, // Producto
            { wch: 18 }, // Codigo
            { wch: 25 }, // Categoría
            { wch: 25 }, // Ubicación
            { wch: 12 }, // Cantidad
        ];

        xlsx.utils.book_append_sheet(wb, ws, 'Surtido');

        const nombreArchivo = `surtido_${SURTIDO_ID}.xlsx`;

        xlsx.writeFile(wb, nombreArchivo);

        console.log(`✅ Archivo generado: ${nombreArchivo}`);
        console.log(`📦 Productos exportados: ${filas.length}`);
    } catch (err) {
        console.error('❌ Error:', err?.message || err);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect().catch(() => { });
    }
})();