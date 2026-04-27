const mongoose = require("mongoose");
const { Schema } = mongoose;

const TurnoConsultorioCounterSchema = new Schema(
  {
    farmaciaId: {
      type: Schema.Types.ObjectId,
      ref: "Farmacia",
      required: true,
      index: true,
    },
    fechaKey: {
      type: String,
      required: true,
      trim: true, // YYYY-MM-DD (America/Mexico_City)
      index: true,
    },
    seq: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

TurnoConsultorioCounterSchema.index({ farmaciaId: 1, fechaKey: 1 }, { unique: true });

module.exports = mongoose.model("TurnoConsultorioCounter", TurnoConsultorioCounterSchema);
