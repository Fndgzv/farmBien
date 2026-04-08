require('dotenv').config();
const mongoose = require('mongoose');

const MONGO =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    'mongodb://127.0.0.1:27017/farmBien';

const FARMACIA_ID = new mongoose.Types.ObjectId('67d73b3a6348d5c1f9b74313'); // farmacia del bienetar

const ProductoSchema = new mongoose.Schema(
    {
        nombre: String,
        categoria: String,
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

const Producto =
    mongoose.models.ProductoTmpIV ||
    mongoose.model('ProductoTmpIV', ProductoSchema);

const InventarioFarmacia =
    mongoose.models.InventarioFarmaciaTmpIV ||
    mongoose.model('InventarioFarmaciaTmpIV', InventarioFarmaciaSchema);

(async () => {
    try {
        console.log('> Conectando a MongoDB:', MONGO.replace(/\/\/.*@/, '//***@'));
        await mongoose.connect(MONGO, { autoIndex: false });

        const productosIV = await Producto.find({
            $or: [
                /* { categoria: 'VI' },
                { categoria: 'vi' },
                { categoria: 'SUPLEMENTOS' },
                { categoria: 'Suplementos' },
                { categoria: /^SUPLEMENTOS / },
                { categoria: /^Suplementos / },
                { categoria: 'Desodorante' },
                { categoria: /^Desodorante / } */
                { categoria: /^Curación / },
                { categoria: 'Curacion' },
                { categoria: 'Curación' },
                { categoria: 'Curaciones' }
            ],
        })
            .select({ _id: 1, nombre: 1, categoria: 1 })
            .lean();

        console.log(`> Productos encontrados: ${productosIV.length}`);

        if (!productosIV.length) {
            console.log('⚠️ No se encontraron productos con esas categorías.');
            return;
        }

        const productoIds = productosIV.map(p => p._id);

        const inventarios = await InventarioFarmacia.find({
            farmacia: FARMACIA_ID,
            producto: { $in: productoIds },
        })
            .select({ _id: 1, producto: 1, existencia: 1 })
            .lean();

        console.log(`> Inventarios a actualizar en esa farmacia: ${inventarios.length}`);

        if (!inventarios.length) {
            console.log('⚠️ No se encontraron inventarios de esa farmacia para productos categoría IV/iv.');
            return;
        }

        let actualizados = 0;

        for (const inv of inventarios) {
            await InventarioFarmacia.findOneAndUpdate(
                { _id: inv._id },
                { $set: { existencia: 0 } },
                { new: true }
            );

            actualizados++;
        }

        console.log(`✅ Inventarios actualizados a existencia=0: ${actualizados}`);
    } catch (err) {
        console.error('❌ Error en el script:', err?.message || err);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect().catch(() => { });
    }
})();