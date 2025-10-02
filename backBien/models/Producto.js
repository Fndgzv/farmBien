// backBien\models\Producto.js
const mongoose = require("mongoose");

const LoteSchema = new mongoose.Schema({
    lote: { type: String, required: true },
    fechaCaducidad: { type: Date, required: true },
    cantidad: { type: Number, required: true } // Se irá restando conforme se vendan productos
});

const ProductoSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    codigoBarras: { type: String },
    unidad: { type: String, required: true },
    precio: { type: Number, required: true },
    costo: { type: Number, required: true },
    iva: { type: Boolean },
    stockMinimo: { type: Number, required: true, default: 50 },
    stockMaximo: { type: Number, required: true, default: 100 },
    ubicacion: { type: String },
    categoria: { type: String, required: true },
    generico: { type: Boolean, default: false },
    renglon1: { type: String },
    renglon2: { type: String },

    promoLunes: {
        porcentaje: { type: Number, min: 0, max: 100 },
        inicio: { type: Date },
        fin: { type: Date },
        monedero: { type: Boolean },
    },
    promoMartes: {
        porcentaje: { type: Number, min: 0, max: 100 },
        inicio: { type: Date },
        fin: { type: Date },
        monedero: { type: Boolean },
    },
    promoMiercoles: {
        porcentaje: { type: Number, min: 0, max: 100 },
        inicio: { type: Date },
        fin: { type: Date },
        monedero: { type: Boolean },
    },
    promoJueves: {
        porcentaje: { type: Number, min: 0, max: 100 },
        inicio: { type: Date },
        fin: { type: Date },
        monedero: { type: Boolean },
    },
    promoViernes: {
        porcentaje: { type: Number, min: 0, max: 100 },
        inicio: { type: Date },
        fin: { type: Date },
        monedero: { type: Boolean },
    },
    promoSabado: {
        porcentaje: { type: Number, min: 0, max: 100 },
        inicio: { type: Date },
        fin: { type: Date },
        monedero: { type: Boolean },
    },
    promoDomingo: {
        porcentaje: { type: Number, min: 0, max: 100 },
        inicio: { type: Date },
        fin: { type: Date },
        monedero: { type: Boolean },
    },

    promoCantidadRequerida: { type: Number, enum: [4, 3, 2] }, // 4x3, 3x2, 2x1
    inicioPromoCantidad: { type: Date },
    finPromoCantidad: { type: Date },

    descuentoINAPAM: { type: Boolean, default: false }, // Descuento del 5% para adultos mayores

    promoDeTemporada: {
        porcentaje: { type: Number, min: 0, max: 100 },
        inicio: { type: Date },
        fin: { type: Date },
        monedero: { type: Boolean },
    },

    lotes: [LoteSchema], // Inventario controlado por lotes
    imagen: { type: String }
}, { timestamps: true });

ProductoSchema.index({ codigoBarras: 1 }, { sparse: true });
ProductoSchema.index({ nombre: 1 });

module.exports = mongoose.model("Producto", ProductoSchema);
