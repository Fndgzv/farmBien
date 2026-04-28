const mongoose = require("mongoose");

const SesionActivaSchema = new mongoose.Schema(
  {
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },
    rol: {
      type: String,
      required: true,
      trim: true,
    },
    farmacia: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Farmacia",
      default: null,
      index: true,
    },

    sessionId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    tokenJti: {
      type: String,
      default: "",
      index: true,
      trim: true,
    },

    ip: {
      type: String,
      default: "",
      trim: true,
    },
    userAgent: {
      type: String,
      default: "",
      trim: true,
      maxlength: 512,
    },
    deviceId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 128,
    },
    deviceFingerprint: {
      type: String,
      default: "",
      trim: true,
      maxlength: 128,
    },

    estado: {
      type: String,
      enum: ["active", "logged_out", "password_changed", "disabled_user", "expired", "revoked"],
      default: "active",
      index: true,
    },
    motivo: {
      type: String,
      default: "",
      trim: true,
      maxlength: 240,
    },

    iniciadoEn: {
      type: Date,
      default: Date.now,
      index: true,
    },
    ultimoUsoEn: {
      type: Date,
      default: Date.now,
      index: true,
    },
    cerradoEn: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

SesionActivaSchema.index({ usuario: 1, estado: 1, expiresAt: 1 });
SesionActivaSchema.index({ sessionId: 1, tokenJti: 1 });
SesionActivaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("SesionActiva", SesionActivaSchema);
