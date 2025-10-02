const { Schema, model } = require('mongoose');

const ElementoSchema = new Schema({
  // tipo: 'text' | 'barcode' | 'price'
  type: { type: String, enum: ['text', 'barcode', 'price'], required: true },

  // Qué campo de datos muestra (solo aplica a type='text' o 'price')
  // 'nombre' | 'codigoBarras' | 'renglon1' | 'renglon2' | 'precioVenta' | 'custom'
  field: { type: String, default: 'nombre' },

  // Texto fijo si field = 'custom'
  text: { type: String, default: '' },

  // Posición y tamaño como porcentajes relativos (0-100) para que escale con el tamaño de etiqueta
  x: { type: Number, min: 0, max: 100, default: 5 },
  y: { type: Number, min: 0, max: 100, default: 5 },
  w: { type: Number, min: 0, max: 100, default: 50 }, // ancho relativo (para wrap)
  h: { type: Number, min: 0, max: 100, default: 10 },

  // Estilo
  fontSize: { type: Number, default: 10 },  // en pt aprox (lo convertiremos en CSS)
  bold: { type: Boolean, default: false },
  align: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
  uppercase: { type: Boolean, default: false },
  prefix: { type: String, default: '' }, // ej. "$"
  suffix: { type: String, default: '' },

  // Opciones de código de barras (para type='barcode')
  barcode: {
    symbology: { type: String, enum: ['CODE128', 'EAN13', 'EAN8', 'QR'], default: 'CODE128' },
    width: { type: Number, default: 1 },   // grosor barra (px)
    height: { type: Number, default: 30 }, // alto (px)
    displayValue: { type: Boolean, default: false } // mostrar el texto debajo
  }
}, { _id: false });

const LabelDesignSchema = new Schema({
  nombre: { type: String, required: true, trim: true, unique: true },

  // Tamaño físico de la etiqueta (para CSS de impresión)
  size: {
    widthMm: { type: Number, default: 50 },   // ancho etiqueta en mm
    heightMm: { type: Number, default: 30 },  // alto etiqueta en mm
    marginMm: { type: Number, default: 2 }    // margen interno
  },

  // Configuración de hoja/página (cuando se imprimen varias por página)
  layout: {
    pageWidthMm:  { type: Number, default: 210 }, // A4
    pageHeightMm: { type: Number, default: 297 }, // A4
    columns:      { type: Number, default: 4 },
    rows:         { type: Number, default: 8 },
    gapXmm:       { type: Number, default: 2 },
    gapYmm:       { type: Number, default: 2 }
  },

  elements: { type: [ElementoSchema], default: [] },

  // Metadatos
  creadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
});

LabelDesignSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = model('LabelDesign', LabelDesignSchema);
