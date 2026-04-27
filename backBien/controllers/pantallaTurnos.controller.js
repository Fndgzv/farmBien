const mongoose = require("mongoose");
const path = require("path");
const FichaConsultorio = require("../models/FichaConsultorio");
const Farmacia = require("../models/Farmacia");
const PantallaTurnosConfig = require("../models/PantallaTurnosConfig");

const VIDEO_DEFAULT_URL = String(process.env.PANTALLA_TURNOS_VIDEO_URL || "").trim();
const EXTENSIONES_VIDEO_SOPORTADAS = new Set(["mp4", "webm", "ogg", "ogv", "mov"]);

function getFarmaciaObjetivo(req) {
  const rol = String(req.usuario?.rol || "").trim();
  const fromUser = req.usuario?.farmacia;
  const farmaciaUsuario = fromUser ? String(fromUser) : "";

  // El rol "turnos" siempre queda fijo a su farmacia asociada.
  if (rol === "turnos") {
    return farmaciaUsuario;
  }

  const fromQuery = req.query?.farmaciaId;
  const fromBody = req.body?.farmaciaId;
  const fromHeader = req.headers["x-farmacia-id"];
  const farmaciaId = fromQuery || fromBody || fromHeader || farmaciaUsuario;
  if (!farmaciaId) return "";
  return String(farmaciaId);
}

function normalizarVideoUrl(urlRaw) {
  let videoUrl = String(urlRaw || "").trim();
  if (!videoUrl) return "";

  if (videoUrl.startsWith("uploads/")) videoUrl = `/${videoUrl}`;
  if (videoUrl.startsWith("assets/")) videoUrl = `/${videoUrl}`;

  return videoUrl;
}

function esVideoUrlValida(videoUrl) {
  if (!videoUrl) return false;

  if (/^https?:\/\//i.test(videoUrl)) return true;
  if (/^\/(uploads|assets)\//i.test(videoUrl)) return true;

  return false;
}

function extensionVideoSoportada(videoUrl) {
  if (!videoUrl) return false;

  let pathname = String(videoUrl || "").trim();

  if (/^https?:\/\//i.test(pathname)) {
    try {
      const parsed = new URL(pathname);
      pathname = parsed.pathname || "";
    } catch {
      pathname = pathname.split("?")[0].split("#")[0];
    }
  } else {
    pathname = pathname.split("?")[0].split("#")[0];
  }

  const ext = path.extname(pathname).replace(".", "").toLowerCase();
  if (!ext) return true; // URLs con firma/ruta sin extensión quedan permitidas
  return EXTENSIONES_VIDEO_SOPORTADAS.has(ext);
}

async function resolverVideoPromocional(farmaciaId) {
  const config = await PantallaTurnosConfig.findOne({ farmaciaId })
    .select("videoUrl")
    .lean();

  const videoConfig = normalizarVideoUrl(config?.videoUrl);

  if (videoConfig) {
    return {
      videoPromocionalUrl: videoConfig,
      usaVideoDefault: false,
    };
  }

  return {
    videoPromocionalUrl: normalizarVideoUrl(VIDEO_DEFAULT_URL),
    usaVideoDefault: true,
  };
}

exports.obtenerResumenPantallaTurnos = async (req, res) => {
  try {
    const farmaciaId = getFarmaciaObjetivo(req);
    if (!farmaciaId) {
      return res.status(400).json({ msg: "Falta farmacia activa" });
    }

    if (!mongoose.isValidObjectId(farmaciaId)) {
      return res.status(400).json({ msg: "farmaciaId invalida" });
    }

    const farmacia = await Farmacia.findOne({ _id: farmaciaId, activo: true })
      .select("_id nombre")
      .lean();

    if (!farmacia) {
      return res.status(404).json({ msg: "Farmacia no encontrada o inactiva" });
    }

    const turnoEnAtencion = await FichaConsultorio.findOne({
      farmaciaId,
      estado: "EN_ATENCION",
    })
      .sort({ llamadoAt: 1, inicioAtencionAt: 1, llegadaAt: 1, _id: 1 })
      .select("folio turnoFecha turnoConsecutivo llegadaAt llamadoAt inicioAtencionAt estado")
      .lean();

    const siguientesTurnos = await FichaConsultorio.find({
      farmaciaId,
      estado: "EN_ESPERA",
    })
      .sort({ urgencia: -1, llegadaAt: 1, _id: 1 })
      .limit(3)
      .select("folio turnoFecha turnoConsecutivo llegadaAt estado")
      .lean();

    const pendientesTotales = await FichaConsultorio.countDocuments({
      farmaciaId,
      estado: "EN_ESPERA",
    });

    const video = await resolverVideoPromocional(farmaciaId);

    return res.json({
      ok: true,
      farmacia,
      turnoEnAtencion: turnoEnAtencion || null,
      siguientesTurnos,
      pendientesTotales,
      ...video,
      actualizadoEn: new Date().toISOString(),
    });
  } catch (err) {
    console.error("obtenerResumenPantallaTurnos:", err);
    return res.status(500).json({ msg: "Error al obtener datos de PantallaTurnos" });
  }
};

exports.actualizarVideoPromocional = async (req, res) => {
  try {
    const farmaciaId = getFarmaciaObjetivo(req);
    if (!farmaciaId) {
      return res.status(400).json({ msg: "Falta farmacia activa" });
    }

    if (!mongoose.isValidObjectId(farmaciaId)) {
      return res.status(400).json({ msg: "farmaciaId invalida" });
    }

    const farmacia = await Farmacia.findOne({ _id: farmaciaId, activo: true })
      .select("_id nombre")
      .lean();

    if (!farmacia) {
      return res.status(404).json({ msg: "Farmacia no encontrada o inactiva" });
    }

    const videoUrl = normalizarVideoUrl(req.body?.videoUrl);

    if (!videoUrl) {
      await PantallaTurnosConfig.deleteOne({ farmaciaId });
      const video = await resolverVideoPromocional(farmaciaId);

      return res.json({
        ok: true,
        farmacia,
        ...video,
        msg: "Video promocional limpiado. Se usara el valor por defecto.",
      });
    }

    if (!esVideoUrlValida(videoUrl)) {
      return res.status(400).json({
        msg: "videoUrl invalida. Usa una URL http(s) o una ruta local /uploads/... o /assets/...",
      });
    }

    if (!extensionVideoSoportada(videoUrl)) {
      return res.status(400).json({
        msg: "Formato de video no soportado. Usa .mp4, .webm, .ogg/.ogv o .mov.",
      });
    }

    await PantallaTurnosConfig.findOneAndUpdate(
      { farmaciaId },
      {
        $set: {
          videoUrl,
          actualizadaPor: req.usuario?._id || null,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.json({
      ok: true,
      farmacia,
      videoPromocionalUrl: videoUrl,
      usaVideoDefault: false,
      msg: "Video promocional actualizado.",
    });
  } catch (err) {
    console.error("actualizarVideoPromocional:", err);
    return res.status(500).json({ msg: "Error al actualizar video promocional" });
  }
};
