const mongoose = require("mongoose");
let InventarioFisico;

setImmediate(() => {
    InventarioFisico = mongoose.model("InventarioFisico");
});

module.exports = function (ProductoSchema) {

    ProductoSchema.post('save', async function (doc) {
        try {
            // Solo registrar si lotes cambiaron
            if (!this.isModified('lotes')) return;

            const sumaActual = doc.lotes.reduce((acc, l) => acc + (l.cantidad || 0), 0);

            const existenciaAnterior = await InventarioFisico.findOne({ 
                producto: doc._id, 
                farmaNombre: "Almacén" 
            })
            .sort({ fechaInv: -1 })
            .then(a => a?.existenciaFisica ?? 0);

            if (existenciaAnterior === sumaActual) return;

            await InventarioFisico.create({
                fechaInv: new Date(),
                farmaNombre: "Almacén",
                producto: doc._id,
                existenciaSistema: existenciaAnterior,
                existenciaFisica: sumaActual,
                diferencia: sumaActual - existenciaAnterior,
                perdida: (sumaActual - existenciaAnterior) * (doc.costo || 0),
                usuario: null
            });

        } catch (err) {
            console.error("❌ Error registrando inventario físico (almacén):", err);
        }
    });
};
