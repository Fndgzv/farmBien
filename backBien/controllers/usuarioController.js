const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const multer = require("multer");
const mime = require("mime-types");

const Usuario = require("../models/Usuario");
const Farmacia = require("../models/Farmacia");
const { revokeAllUserSessions } = require("../utils/sessionSecurity");

const ROOT_DIR = path.join(__dirname, "..");
const UPLOADS_DIR = path.join(ROOT_DIR, "uploads");
const UPLOADS_USUARIOS_LOGO_DIR = path.join(UPLOADS_DIR, "usuarios", "logoescuela");
fs.mkdirSync(UPLOADS_USUARIOS_LOGO_DIR, { recursive: true });

function extFromMimetype(mimetype) {
  const ext = mime.extension(mimetype);
  return ext ? `.${ext}` : ".bin";
}

function makeTempUploadName(mimetype) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extFromMimetype(mimetype)}`;
}

const uploadLogoEscuelaStorage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await fsp.mkdir(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    } catch (e) {
      cb(e);
    }
  },
  filename: (_req, file, cb) => {
    cb(null, makeTempUploadName(file.mimetype));
  },
});

const uploadLogoEscuelaFilter = (_req, file, cb) => {
  const ok = /^image\/(png|jpe?g|webp|gif|bmp|tiff|avif)$/i.test(file.mimetype);
  if (!ok) return cb(new Error("Tipo de imagen no permitido"));
  cb(null, true);
};

const uploadLogoEscuela = multer({
  storage: uploadLogoEscuelaStorage,
  fileFilter: uploadLogoEscuelaFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("logoescuela");

const resolveUploadAbs = (storedPath) => {
  if (!storedPath || typeof storedPath !== "string") return null;

  const relative = String(storedPath).trim().replace(/^\/+/, "");
  const relWithUploads = /^uploads\//i.test(relative)
    ? relative
    : `uploads/${relative}`;
  const abs = path.join(ROOT_DIR, relWithUploads);
  const normAbs = path.resolve(abs);
  const normUploads = path.resolve(UPLOADS_DIR);

  if (!normAbs.startsWith(normUploads + path.sep) && normAbs !== normUploads) {
    return null;
  }

  return normAbs;
};

const deleteIfExists = async (absPath) => {
  if (!absPath) return;
  try {
    await fsp.unlink(absPath);
  } catch { }
};

const normalizarTexto = (valor) => {
  if (valor === undefined || valor === null) return undefined;
  const limpio = String(valor).trim();
  return limpio ? limpio : undefined;
};

const normalizarBooleano = (valor, fallback = undefined) => {
  if (valor === undefined || valor === null) return fallback;
  if (typeof valor === "boolean") return valor;
  const normalizado = String(valor).trim().toLowerCase();
  if (["true", "1", "si", "yes", "on"].includes(normalizado)) return true;
  if (["false", "0", "no", "off"].includes(normalizado)) return false;
  return fallback;
};

exports.obtenerUsuarios = async (req, res) => {
  try {
    const usuarios = await Usuario.find().populate("farmacia", "nombre");
    return res.json(usuarios);
  } catch (error) {
    return res.status(500).json({ mensaje: "Error al obtener usuarios" });
  }
};

exports.uploadLogoEscuela = uploadLogoEscuela;

exports.actualizarLogoEscuela = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = await Usuario.findById(id);

    if (!usuario) {
      if (req.file?.path) await deleteIfExists(req.file.path);
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    if (usuario.rol !== "medico") {
      if (req.file?.path) await deleteIfExists(req.file.path);
      return res.status(400).json({ mensaje: "El logo de escuela solo aplica para usuarios médicos." });
    }

    if (!req.file) {
      return res.status(400).json({ mensaje: "No se recibió archivo de logoescuela." });
    }

    await fsp.mkdir(UPLOADS_USUARIOS_LOGO_DIR, { recursive: true });

    const newName = `${usuario._id}-${Date.now()}${extFromMimetype(req.file.mimetype)}`;
    const destAbs = path.join(UPLOADS_USUARIOS_LOGO_DIR, newName);
    const destRel = path.posix.join("usuarios", "logoescuela", newName);

    await fsp.rename(req.file.path, destAbs);

    const oldAbs = resolveUploadAbs(usuario.logoescuela);

    usuario.logoescuela = destRel;
    await usuario.save();

    if (oldAbs && path.resolve(oldAbs) !== path.resolve(destAbs)) {
      await deleteIfExists(oldAbs);
    }

    return res.json({
      ok: true,
      mensaje: "Logo de escuela actualizado correctamente",
      logoescuela: usuario.logoescuela,
      usuarioId: usuario._id,
    });
  } catch (error) {
    if (req.file?.path) {
      await deleteIfExists(req.file.path);
    }
    console.error("Error al actualizar logoescuela:", error);
    return res.status(500).json({ mensaje: "Error al actualizar el logo de escuela" });
  }
};

exports.actualizarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      usuario,
      nombre,
      nuevaPassword,
      email,
      telefono,
      domicilio,
      rol,
      farmacia,
      activo,
      cedulaProfesional,
      titulo,
      escuela,
      logoescuela,
    } = req.body;

    const usuarioEncontrado = await Usuario.findById(id);
    if (!usuarioEncontrado) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    const activoOriginal = usuarioEncontrado.activo !== false;
    let invalidarSesiones = false;

    const rolDestino = rol || usuarioEncontrado.rol;
    const farmaciaDestino =
      farmacia !== undefined && farmacia !== null && String(farmacia).trim()
        ? String(farmacia).trim()
        : usuarioEncontrado.farmacia
          ? String(usuarioEncontrado.farmacia)
          : "";

    const cedulaDestino =
      cedulaProfesional !== undefined
        ? normalizarTexto(cedulaProfesional)
        : normalizarTexto(usuarioEncontrado.cedulaProfesional);

    const tituloDestino =
      titulo !== undefined ? normalizarTexto(titulo) : normalizarTexto(usuarioEncontrado.titulo);

    const escuelaDestino =
      escuela !== undefined ? normalizarTexto(escuela) : normalizarTexto(usuarioEncontrado.escuela);

    const logoEscuelaDestino =
      logoescuela !== undefined
        ? normalizarTexto(logoescuela)
        : normalizarTexto(usuarioEncontrado.logoescuela);

    if (usuario && usuario !== usuarioEncontrado.usuario) {
      const existeUsuario = await Usuario.findOne({ usuario });
      if (existeUsuario && existeUsuario._id.toString() !== id) {
        return res.status(400).json({ mensaje: "El nombre de usuario ya esta en uso." });
      }
      usuarioEncontrado.usuario = usuario;
    }

    if (email && email !== usuarioEncontrado.email) {
      const emailExiste = await Usuario.findOne({ email });
      if (emailExiste && emailExiste._id.toString() !== id) {
        return res.status(400).json({ mensaje: "El correo electronico ya esta en uso." });
      }
      usuarioEncontrado.email = email;
    }

    if (telefono && telefono !== usuarioEncontrado.telefono) {
      const telefonoExiste = await Usuario.findOne({ telefono });
      if (telefonoExiste && telefonoExiste._id.toString() !== id) {
        return res.status(400).json({ mensaje: "El telefono ya esta en uso." });
      }
      usuarioEncontrado.telefono = telefono;
    }

    if (nuevaPassword && nuevaPassword.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      usuarioEncontrado.password = await bcrypt.hash(nuevaPassword, salt);
      invalidarSesiones = true;
    }

    const activoDestino = normalizarBooleano(activo, usuarioEncontrado.activo !== false);
    usuarioEncontrado.activo = activoDestino;
    if (activoOriginal && activoDestino === false) {
      invalidarSesiones = true;
    }

    let farmaciaExistente = null;
    if (["medico", "empleado", "turnos", "ajustaFarma"].includes(rolDestino)) {
      if (!farmaciaDestino) {
        const mensajes = {
          medico: "Un medico debe estar asignado a una farmacia.",
          empleado: "Un empleado debe estar asignado a una farmacia.",
          turnos: "Un usuario de turnos debe estar asignado a una farmacia.",
          ajustaFarma: "Un ajustador de farmacia debe tener una farmacia asignada.",
        };
        return res.status(400).json({ mensaje: mensajes[rolDestino] });
      }

      farmaciaExistente = await Farmacia.findById(farmaciaDestino);
      if (!farmaciaExistente) {
        return res.status(404).json({ mensaje: "Farmacia no encontrada" });
      }
    }

    if (rolDestino === "medico") {
      if (!cedulaDestino) {
        return res.status(400).json({ mensaje: "La cedula profesional es obligatoria para medicos." });
      }
      if (!tituloDestino) {
        return res.status(400).json({ mensaje: "El titulo es obligatorio para medicos." });
      }
      if (!escuelaDestino) {
        return res.status(400).json({ mensaje: "La institucion educativa es obligatoria para medicos." });
      }
    }

    usuarioEncontrado.rol = rolDestino;

    if (rolDestino === "medico") {
      usuarioEncontrado.farmacia = farmaciaExistente ? farmaciaExistente._id : farmaciaDestino;
      usuarioEncontrado.cedulaProfesional = cedulaDestino;
      usuarioEncontrado.titulo = tituloDestino;
      usuarioEncontrado.escuela = escuelaDestino;
      if (logoescuela !== undefined) {
        usuarioEncontrado.logoescuela = logoEscuelaDestino;
      }
    } else if (rolDestino === "empleado" || rolDestino === "turnos") {
      usuarioEncontrado.farmacia = farmaciaExistente ? farmaciaExistente._id : farmaciaDestino;
      usuarioEncontrado.cedulaProfesional = undefined;
      usuarioEncontrado.titulo = undefined;
      usuarioEncontrado.escuela = undefined;
      usuarioEncontrado.logoescuela = undefined;
    } else if (rolDestino === "ajustaFarma") {
      usuarioEncontrado.farmacia = farmaciaExistente ? farmaciaExistente._id : farmaciaDestino;
      usuarioEncontrado.cedulaProfesional = undefined;
      usuarioEncontrado.titulo = undefined;
      usuarioEncontrado.escuela = undefined;
      usuarioEncontrado.logoescuela = undefined;
    } else {
      usuarioEncontrado.farmacia = null;
      usuarioEncontrado.cedulaProfesional = undefined;
      usuarioEncontrado.titulo = undefined;
      usuarioEncontrado.escuela = undefined;
      usuarioEncontrado.logoescuela = undefined;
    }

    usuarioEncontrado.nombre = nombre || usuarioEncontrado.nombre;
    usuarioEncontrado.domicilio = domicilio || usuarioEncontrado.domicilio;

    await usuarioEncontrado.save();

    if (invalidarSesiones) {
      await revokeAllUserSessions(
        usuarioEncontrado._id,
        usuarioEncontrado.activo === false ? "disabled_user" : "password_changed"
      );
    }

    const usuarioActualizado = await Usuario.findById(id).populate("farmacia", "nombre direccion telefono");
    return res.json({ mensaje: "Usuario actualizado correctamente", usuario: usuarioActualizado });
  } catch (error) {
    return res.status(500).json({ mensaje: "Error al actualizar usuario", error });
  }
};

exports.registrarUsuario = async (req, res) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(400).json({ errores: errores.array() });
  }

  const {
    usuario,
    nombre,
    telefono,
    email,
    password,
    domicilio,
    rol,
    farmacia,
    activo,
    cedulaProfesional,
    titulo,
    escuela,
    logoescuela,
  } = req.body;

  const telefonoRegex = /^\d{10}$/;
  if (telefono && !telefonoRegex.test(telefono)) {
    return res.status(400).json({ mensaje: "El telefono debe contener exactamente 10 digitos numericos." });
  }

  try {
    const usuarioExistente = await Usuario.findOne({ usuario });
    if (usuarioExistente) {
      return res.status(400).json({ mensaje: "El nombre de usuario ya esta registrado." });
    }

    if (email) {
      const emailExistente = await Usuario.findOne({ email });
      if (emailExistente) {
        return res.status(400).json({ mensaje: "El correo electronico ya esta en uso." });
      }
    }

    if (telefono) {
      const telefonoExistente = await Usuario.findOne({ telefono });
      if (telefonoExistente) {
        return res.status(400).json({ mensaje: "El telefono ya esta registrado por otro usuario." });
      }
    }

    let farmaciaAsignada = null;
    const cedulaNormalizada = normalizarTexto(cedulaProfesional);
    const tituloNormalizado = normalizarTexto(titulo);
    const escuelaNormalizada = normalizarTexto(escuela);
    const logoEscuelaNormalizado = normalizarTexto(logoescuela);

    if (rol === "medico") {
      if (!farmacia) {
        return res.status(400).json({ mensaje: "Un medico debe estar asignado a una farmacia." });
      }
      if (!cedulaNormalizada) {
        return res.status(400).json({ mensaje: "La cedula profesional es obligatoria para medicos." });
      }
      if (!tituloNormalizado) {
        return res.status(400).json({ mensaje: "El titulo es obligatorio para medicos." });
      }
      if (!escuelaNormalizada) {
        return res.status(400).json({ mensaje: "La institucion educativa es obligatoria para medicos." });
      }
      farmaciaAsignada = await Farmacia.findById(farmacia);
      if (!farmaciaAsignada) {
        return res.status(404).json({ mensaje: "Farmacia no encontrada" });
      }
    }

    if (rol === "empleado") {
      if (!farmacia) {
        return res.status(400).json({ mensaje: "Un empleado debe estar asignado a una farmacia." });
      }
      farmaciaAsignada = await Farmacia.findById(farmacia);
      if (!farmaciaAsignada) {
        return res.status(404).json({ mensaje: "Farmacia no encontrada" });
      }
    }

    if (rol === "turnos") {
      if (!farmacia) {
        return res.status(400).json({ mensaje: "Un usuario de turnos debe estar asignado a una farmacia." });
      }
      farmaciaAsignada = await Farmacia.findById(farmacia);
      if (!farmaciaAsignada) {
        return res.status(404).json({ mensaje: "Farmacia no encontrada" });
      }
    }

    if (rol === "ajustaAlmacen" || rol === "ajustaSoloAlmacen") {
      farmaciaAsignada = null;
    }

    if (rol === "ajustaFarma") {
      if (!farmacia) {
        return res.status(400).json({ mensaje: "Un usuario ajustaFarma debe estar asignado a una farmacia." });
      }
      farmaciaAsignada = await Farmacia.findById(farmacia);
      if (!farmaciaAsignada) {
        return res.status(404).json({ mensaje: "Farmacia no encontrada" });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const activoNormalizado = normalizarBooleano(activo, true);

    const nuevoUsuario = new Usuario({
      usuario,
      nombre,
      telefono,
      email,
      password: hashedPassword,
      domicilio,
      rol,
      activo: activoNormalizado,
      farmacia: farmaciaAsignada ? farmaciaAsignada._id : null,
      cedulaProfesional: rol === "medico" ? cedulaNormalizada : undefined,
      titulo: rol === "medico" ? tituloNormalizado : undefined,
      escuela: rol === "medico" ? escuelaNormalizada : undefined,
      logoescuela: rol === "medico" ? logoEscuelaNormalizado : undefined,
    });

    await nuevoUsuario.save();

    const usuarioRegistrado = await Usuario.findById(nuevoUsuario._id).populate(
      "farmacia",
      "nombre direccion telefono"
    );

    return res.status(201).json({ mensaje: "Usuario registrado exitosamente", usuario: usuarioRegistrado });
  } catch (error) {
    console.error("Error al registrar usuario:", error.message, error);
    return res.status(500).json({ mensaje: "Error en el servidor", error });
  }
};
