const crypto = require("crypto");
const jwt = require("jsonwebtoken");

class SessionSecurityError extends Error {
  constructor(message, code = "SESSION_SECURITY_ERROR", status = 500) {
    super(message);
    this.name = "SessionSecurityError";
    this.code = code;
    this.status = status;
  }
}

const LOG_PREFIX = "[SESSION_SECURITY]";
let cachedModel = null;

function logInfo(message, extra = "") {
  if (extra) {
    console.log(`${LOG_PREFIX} ${message}`, extra);
    return;
  }
  console.log(`${LOG_PREFIX} ${message}`);
}

function logWarn(message, extra = "") {
  if (extra) {
    console.warn(`${LOG_PREFIX} ${message}`, extra);
    return;
  }
  console.warn(`${LOG_PREFIX} ${message}`);
}

function isEnabled() {
  const raw = String(process.env.SESSION_SECURITY_ENABLED || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

function getJwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || "12h";
}

function getRetentionHours() {
  const raw = Number(process.env.SESSION_SECURITY_RETENTION_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 48;
}

function randomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function safeString(value, max = 512) {
  return String(value || "").trim().slice(0, max);
}

function getFarmaciaId(usuario) {
  if (!usuario) return null;
  if (!usuario.farmacia) return null;
  if (typeof usuario.farmacia === "string") return usuario.farmacia;
  if (usuario.farmacia._id) return String(usuario.farmacia._id);
  return String(usuario.farmacia);
}

function getTokenFromRequest(req) {
  const headerToken = req.header("x-auth-token");
  if (headerToken) return String(headerToken).trim();

  const authHeader = req.header("authorization");
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, "").trim();
  }
  return "";
}

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  let ip = "";

  if (Array.isArray(xff) && xff.length) {
    ip = String(xff[0] || "");
  } else if (typeof xff === "string" && xff.trim()) {
    ip = xff.split(",")[0] || "";
  }

  if (!ip) {
    ip = req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip || "";
  }

  ip = String(ip).trim();
  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }
  return ip;
}

function getDeviceId(req) {
  const header = req.headers["x-device-id"];
  if (Array.isArray(header) && header.length) {
    return safeString(header[0], 128);
  }
  if (typeof header === "string") {
    return safeString(header, 128);
  }
  if (typeof req.body?.deviceId === "string") {
    return safeString(req.body.deviceId, 128);
  }
  return "";
}

function getDeviceFingerprint(req, deviceId = "") {
  const ua = safeString(req.headers["user-agent"], 256);
  const lang = safeString(req.headers["accept-language"], 120);
  const secUa = safeString(req.headers["sec-ch-ua"], 180);
  return crypto
    .createHash("sha256")
    .update(`${deviceId}|${ua}|${lang}|${secUa}`)
    .digest("hex");
}

function decodeTokenExpiry(token) {
  try {
    const decoded = jwt.decode(token);
    if (decoded?.exp) {
      return new Date(Number(decoded.exp) * 1000);
    }
  } catch (_) {}
  return new Date(Date.now() + 12 * 60 * 60 * 1000);
}

function revokedExpiresAt(now = new Date()) {
  const retentionMs = getRetentionHours() * 60 * 60 * 1000;
  return new Date(now.getTime() + retentionMs);
}

function getSessionModelSafe() {
  if (cachedModel) return cachedModel;

  try {
    cachedModel = require("../models/SesionActiva");
    return cachedModel;
  } catch (error) {
    logWarn("No se pudo cargar el modelo SesionActiva. Se aplicara modo fail-safe.", error?.message || "");
    return null;
  }
}

async function cleanupSessionsBestEffort(model, usuarioId = null) {
  if (!model) return;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - getRetentionHours() * 60 * 60 * 1000);
  const filter = usuarioId ? { usuario: usuarioId } : {};

  try {
    await model.deleteMany({
      ...filter,
      $or: [
        { expiresAt: { $lte: now } },
        {
          estado: { $ne: "active" },
          cerradoEn: { $ne: null, $lte: staleBefore },
        },
      ],
    });
  } catch (error) {
    logWarn("No se pudo limpiar sesiones antiguas.", error?.message || "");
  }
}

function signLegacyToken(usuario) {
  const payload = { id: usuario.id || usuario._id, rol: usuario.rol };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: getJwtExpiresIn() });
}

async function generateLoginToken({ usuario, req }) {
  const legacyToken = signLegacyToken(usuario);

  if (!isEnabled()) {
    return {
      token: legacyToken,
      sessionSecurityEnabled: false,
      sessionRegistered: false,
      sessionReason: "feature_flag_disabled",
    };
  }

  const model = getSessionModelSafe();
  if (!model) {
    return {
      token: legacyToken,
      sessionSecurityEnabled: true,
      sessionRegistered: false,
      sessionReason: "model_unavailable_fail_safe",
    };
  }

  const now = new Date();
  const usuarioId = String(usuario._id || usuario.id);
  const rol = String(usuario.rol || "");

  await cleanupSessionsBestEffort(model, usuarioId);

  try {
    if (rol !== "admin") {
      const sesionActiva = await model.findOne({
        usuario: usuarioId,
        estado: "active",
        expiresAt: { $gt: now },
      });

      if (sesionActiva) {
        throw new SessionSecurityError(
          "Ya existe una sesion activa para este usuario. Cierra la sesion anterior antes de iniciar otra.",
          "SESSION_ACTIVE_EXISTS",
          409
        );
      }
    }

    const sessionId = randomId(16);
    const tokenJti = randomId(16);
    const payload = {
      id: usuarioId,
      rol,
      sid: sessionId,
      jti: tokenJti,
    };

    const farmaciaId = getFarmaciaId(usuario);
    if (farmaciaId) {
      payload.fid = farmaciaId;
    }

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: getJwtExpiresIn() });
    const expiresAt = decodeTokenExpiry(token);

    await model.create({
      usuario: usuarioId,
      rol,
      farmacia: farmaciaId || null,
      sessionId,
      tokenJti,
      ip: getClientIp(req),
      userAgent: safeString(req.headers["user-agent"], 512),
      deviceId: getDeviceId(req),
      deviceFingerprint: getDeviceFingerprint(req, getDeviceId(req)),
      estado: "active",
      iniciadoEn: now,
      ultimoUsoEn: now,
      expiresAt,
    });

    return {
      token,
      sessionSecurityEnabled: true,
      sessionRegistered: true,
      sessionReason: "session_registered",
    };
  } catch (error) {
    if (error instanceof SessionSecurityError) {
      throw error;
    }

    logWarn("Fallo registro de sesion en login. Se usara token legacy (fail-safe).", error?.message || "");
    return {
      token: legacyToken,
      sessionSecurityEnabled: true,
      sessionRegistered: false,
      sessionReason: "session_registration_failed_fail_safe",
    };
  }
}

async function revokeSessionByTokenPayload(decoded, reason = "logged_out") {
  if (!isEnabled()) return { ok: true, mode: "disabled" };

  const model = getSessionModelSafe();
  if (!model) return { ok: true, mode: "fail_safe_model_unavailable" };

  const sessionId = safeString(decoded?.sid, 128);
  if (!sessionId) return { ok: true, mode: "legacy_token_without_sid" };

  const now = new Date();
  try {
    await model.updateOne(
      { sessionId, estado: "active" },
      {
        $set: {
          estado: "logged_out",
          motivo: reason,
          cerradoEn: now,
          expiresAt: revokedExpiresAt(now),
        },
      }
    );
    return { ok: true, mode: "revoked" };
  } catch (error) {
    logWarn("No se pudo invalidar sesion en logout (fail-safe).", error?.message || "");
    return { ok: true, mode: "fail_safe_revoke_error" };
  }
}

async function revokeAllUserSessions(usuarioId, reason = "password_changed") {
  if (!isEnabled()) return { ok: true, mode: "disabled" };

  const model = getSessionModelSafe();
  if (!model) return { ok: true, mode: "fail_safe_model_unavailable" };

  const now = new Date();
  try {
    await model.updateMany(
      { usuario: usuarioId, estado: "active" },
      {
        $set: {
          estado: reason === "disabled_user" ? "disabled_user" : "password_changed",
          motivo: reason,
          cerradoEn: now,
          expiresAt: revokedExpiresAt(now),
        },
      }
    );
    return { ok: true, mode: "revoked" };
  } catch (error) {
    logWarn("No se pudieron invalidar sesiones del usuario (fail-safe).", error?.message || "");
    return { ok: true, mode: "fail_safe_revoke_error" };
  }
}

async function validateSessionOnRequest({ decoded, req, usuario }) {
  if (!isEnabled()) {
    return { allow: true, mode: "disabled" };
  }

  const model = getSessionModelSafe();
  if (!model) {
    return { allow: true, mode: "fail_safe_model_unavailable" };
  }

  const sessionId = safeString(decoded?.sid, 128);
  if (!sessionId) {
    return { allow: true, mode: "legacy_token_without_sid" };
  }

  const tokenJti = safeString(decoded?.jti, 128);
  const now = new Date();

  try {
    const sesion = await model.findOne({ sessionId });

    if (!sesion) {
      logWarn(`No existe sesion registrada para sid=${sessionId}. Permitido por compatibilidad.`);
      return { allow: true, mode: "missing_session_record_compat" };
    }

    if (tokenJti && sesion.tokenJti && sesion.tokenJti !== tokenJti) {
      return {
        allow: false,
        status: 401,
        code: "SESSION_TOKEN_MISMATCH",
        message: "Sesion invalida. Inicia sesion nuevamente.",
      };
    }

    if (sesion.estado !== "active") {
      return {
        allow: false,
        status: 401,
        code: "SESSION_REVOKED",
        message: "Tu sesion ya no esta activa. Inicia sesion nuevamente.",
      };
    }

    if (sesion.expiresAt && new Date(sesion.expiresAt).getTime() <= now.getTime()) {
      await model.updateOne(
        { _id: sesion._id, estado: "active" },
        {
          $set: {
            estado: "expired",
            motivo: "expired",
            cerradoEn: now,
            expiresAt: revokedExpiresAt(now),
          },
        }
      ).catch(() => undefined);

      return {
        allow: false,
        status: 401,
        code: "SESSION_EXPIRED",
        message: "Tu sesion expiro. Inicia sesion nuevamente.",
      };
    }

    const farmaciaUsuario = getFarmaciaId(usuario);
    const farmaciaToken = safeString(decoded?.fid, 64);
    if (farmaciaToken && farmaciaUsuario && farmaciaToken !== farmaciaUsuario) {
      return {
        allow: false,
        status: 401,
        code: "SESSION_FARMACIA_MISMATCH",
        message: "Sesion invalida para la farmacia actual. Inicia sesion nuevamente.",
      };
    }

    const currentDeviceId = getDeviceId(req);
    if (sesion.deviceId && currentDeviceId && sesion.deviceId !== currentDeviceId) {
      return {
        allow: false,
        status: 401,
        code: "SESSION_DEVICE_MISMATCH",
        message: "Sesion invalida para este dispositivo. Inicia sesion nuevamente.",
      };
    }

    model.updateOne(
      { _id: sesion._id, estado: "active" },
      { $set: { ultimoUsoEn: now } }
    ).catch(() => undefined);

    return { allow: true, mode: "validated" };
  } catch (error) {
    logWarn("Error validando sesion activa. Permitido por fail-safe.", error?.message || "");
    return { allow: true, mode: "fail_safe_validation_error" };
  }
}

module.exports = {
  SessionSecurityError,
  isEnabled,
  logInfo,
  logWarn,
  getTokenFromRequest,
  generateLoginToken,
  validateSessionOnRequest,
  revokeSessionByTokenPayload,
  revokeAllUserSessions,
};
