const mongoose = require("mongoose");
const { Schema } = mongoose;

const PantallaTurnosConfigSchema = new Schema(
  {
    farmaciaId: {
      type: Schema.Types.ObjectId,
      ref: "Farmacia",
      required: true,
      unique: true,
      index: true,
    },
    videoUrl: {
      type: String,
      required: true,
      trim: true,
    },
    actualizadaPor: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PantallaTurnosConfig", PantallaTurnosConfigSchema);
