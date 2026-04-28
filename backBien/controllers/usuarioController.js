const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");

const Usuario = require("../models/Usuario");
const Farmacia = require("../models/Farmacia");
const { revokeAllUserSessions } = require("../utils/sessionSecurity");

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
    } else if (rolDestino === "empleado" || rolDestino === "turnos") {
      usuarioEncontrado.farmacia = farmaciaExistente ? farmaciaExistente._id : farmaciaDestino;
      usuarioEncontrado.cedulaProfesional = undefined;
      usuarioEncontrado.titulo = undefined;
      usuarioEncontrado.escuela = undefined;
    } else if (rolDestino === "ajustaFarma") {
      usuarioEncontrado.farmacia = farmaciaExistente ? farmaciaExistente._id : farmaciaDestino;
      usuarioEncontrado.cedulaProfesional = undefined;
      usuarioEncontrado.titulo = undefined;
      usuarioEncontrado.escuela = undefined;
    } else {
      usuarioEncontrado.farmacia = null;
      usuarioEncontrado.cedulaProfesional = undefined;
      usuarioEncontrado.titulo = undefined;
      usuarioEncontrado.escuela = undefined;
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
