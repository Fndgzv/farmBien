const Usuario = require("../models/Usuario");
const Corte = require("../models/CorteCaja");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const {
  SessionSecurityError,
  generateLoginToken,
  getTokenFromRequest,
  isEnabled: isSessionSecurityEnabled,
  logInfo,
  logWarn,
  revokeAllUserSessions,
  revokeSessionByTokenPayload,
} = require("../utils/sessionSecurity");

async function emitirTokenLogin(usuarioExistente, req) {
  try {
    const resultado = await generateLoginToken({ usuario: usuarioExistente, req });
    if (isSessionSecurityEnabled()) {
      logInfo(
        `Login usuario=${usuarioExistente.usuario} rol=${usuarioExistente.rol} session=${resultado.sessionReason}`
      );
    }
    return resultado.token;
  } catch (error) {
    if (error instanceof SessionSecurityError) {
      throw error;
    }
    throw error;
  }
}

exports.iniciarSesion = async (req, res) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(400).json({ errores: errores.array() });
  }

  const { usuario, password, firma } = req.body;

  try {
    const usuarioExistente = await Usuario.findOne({ usuario }).populate(
      "farmacia",
      "nombre direccion telefono firmaHash titulo1 titulo2 imagen imagen2"
    );

    if (!usuarioExistente) {
      return res.status(400).json({ mensaje: "Credenciales incorrectas" });
    }

    const esCorrecto = await bcrypt.compare(password, usuarioExistente.password);
    if (!esCorrecto) {
      return res.status(400).json({ mensaje: "Credenciales incorrectas" });
    }

    if (usuarioExistente.activo === false) {
      return res.status(403).json({ mensaje: "La cuenta esta desactivada." });
    }

    const rol = usuarioExistente.rol;
    const farmaciaAsociada = usuarioExistente.farmacia;

    if (rol === "admin" || rol === "ajustaAlmacen" || rol === "ajustaSoloAlmacen") {
      const token = await emitirTokenLogin(usuarioExistente, req);

      return res.json({
        token,
        user: {
          id: usuarioExistente._id,
          nombre: usuarioExistente.nombre,
          rol: usuarioExistente.rol,
          telefono: usuarioExistente.telefono,
          email: usuarioExistente.email || "",
          domicilio: usuarioExistente.domicilio || "",
          cedulaProfesional: usuarioExistente.cedulaProfesional || "",
          titulo: usuarioExistente.titulo || "",
          escuela: usuarioExistente.escuela || "",
          farmacia: null,
        },
      });
    }

    const rolesConFarmacia = ["empleado", "medico", "ajustaFarma", "turnos"];
    if (rolesConFarmacia.includes(rol) && !farmaciaAsociada) {
      return res.status(409).json({
        mensaje: "El usuario no tiene una farmacia asociada",
      });
    }

    const rolesQueRequierenFirma = ["empleado", "medico"];
    if (rolesQueRequierenFirma.includes(rol)) {
      const corteActivo = await Corte.findOne({
        usuario: usuarioExistente._id,
        farmacia: farmaciaAsociada._id,
        $or: [{ fechaFin: { $exists: false } }, { fechaFin: null }],
      });

      if (!corteActivo) {
        if (!firma || firma.trim() === "") {
          return res.status(401).json({
            mensaje: "Se requiere la firma de la farmacia para iniciar sesion.",
            requiereFirma: true,
          });
        }

        let firmaValida = false;
        if (farmaciaAsociada.firmaHash) {
          try {
            firmaValida = await bcrypt.compare(firma, farmaciaAsociada.firmaHash);
          } catch (_) {
            firmaValida = false;
          }
        }

        if (!firmaValida) {
          return res.status(401).json({
            mensaje: "Firma incorrecta. Verifica con la farmacia.",
            requiereFirma: true,
          });
        }
      }
    }

    const token = await emitirTokenLogin(usuarioExistente, req);

    return res.json({
      token,
      user: {
        id: usuarioExistente._id,
        nombre: usuarioExistente.nombre,
        rol: usuarioExistente.rol,
        telefono: usuarioExistente.telefono,
        email: usuarioExistente.email || "",
        domicilio: usuarioExistente.domicilio || "",
        cedulaProfesional: usuarioExistente.cedulaProfesional || "",
        titulo: usuarioExistente.titulo || "",
        escuela: usuarioExistente.escuela || "",
        farmacia: farmaciaAsociada
          ? {
              _id: farmaciaAsociada._id,
              nombre: farmaciaAsociada.nombre,
              direccion: farmaciaAsociada.direccion,
              telefono: farmaciaAsociada.telefono,
              titulo1: farmaciaAsociada.titulo1,
              titulo2: farmaciaAsociada.titulo2,
              imagen: farmaciaAsociada.imagen,
              imagen2: farmaciaAsociada.imagen2,
            }
          : null,
      },
    });
  } catch (error) {
    if (error instanceof SessionSecurityError && error.code === "SESSION_ACTIVE_EXISTS") {
      logWarn(
        `[LOGIN] decision=bloquear usuario=${usuario} motivo=session_active_exists controller_response`
      );
      return res.status(409).json({
        success: false,
        code: "SESSION_ALREADY_ACTIVE",
        message: "Ya existe una sesi\u00f3n activa para este usuario. Cierra la sesi\u00f3n anterior antes de iniciar una nueva.",
        // Compatibilidad temporal hacia atrás
        codigo: "SESSION_ALREADY_ACTIVE",
        mensaje: "Ya existe una sesi\u00f3n activa para este usuario. Cierra la sesi\u00f3n anterior antes de iniciar una nueva.",
      });
    }

    console.error("Error en iniciarSesion:", error);
    return res.status(500).json({ mensaje: "Error en el servidor" });
  }
};

exports.cerrarSesion = async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.json({ mensaje: "Sesion cerrada correctamente." });
    }

    let decoded = req.auth || null;
    if (!decoded) {
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (_) {
        decoded = null;
      }
    }

    if (decoded) {
      await revokeSessionByTokenPayload(decoded, "logout");
    }

    return res.json({ mensaje: "Sesion cerrada correctamente." });
  } catch (error) {
    console.error("Error en cerrarSesion:", error);
    return res.json({ mensaje: "Sesion cerrada correctamente." });
  }
};

exports.datosUsuarioAutenticado = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select("-password");
    if (!usuario) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }
    return res.json({ usuario });
  } catch (error) {
    return res.status(500).json({ mensaje: "Error al obtener datos del usuario", error });
  }
};

exports.actualizarDatosUsuarioAutenticado = async (req, res) => {
  try {
    const { usuario, nombre, email, domicilio, telefono, password } = req.body;

    if (!usuario || !password || password.trim() === "") {
      return res.status(400).json({ mensaje: "Usuario y contrasena son obligatorios" });
    }

    const userFound = await Usuario.findById(req.usuario.id);
    if (!userFound) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    const isMatch = await bcrypt.compare(password, userFound.password);
    if (!isMatch) {
      return res.status(401).json({ mensaje: "Credenciales incorrectas" });
    }

    if (usuario !== userFound.usuario) {
      const usuarioExistente = await Usuario.findOne({ usuario });
      if (usuarioExistente && usuarioExistente._id.toString() !== userFound._id.toString()) {
        return res.status(400).json({ mensaje: "El nombre de usuario ya esta en uso" });
      }
      userFound.usuario = usuario;
    }

    if (telefono && telefono !== userFound.telefono) {
      const telefonoExistente = await Usuario.findOne({ telefono });
      if (telefonoExistente && telefonoExistente._id.toString() !== userFound._id.toString()) {
        return res.status(400).json({ mensaje: "El telefono ya esta registrado por otro usuario" });
      }
      userFound.telefono = telefono;
    }

    userFound.nombre = nombre || userFound.nombre;
    userFound.email = email || userFound.email;
    userFound.domicilio = domicilio || userFound.domicilio;

    await userFound.save();

    return res.json({
      mensaje: "Datos actualizados correctamente",
      usuario: {
        id: userFound._id,
        usuario: userFound.usuario,
        nombre: userFound.nombre,
        rol: userFound.rol,
        email: userFound.email,
        telefono: userFound.telefono,
        domicilio: userFound.domicilio,
        cedulaProfesional: userFound.cedulaProfesional || "",
        titulo: userFound.titulo || "",
        escuela: userFound.escuela || "",
      },
    });
  } catch (error) {
    return res.status(500).json({ mensaje: "Error al actualizar datos" });
  }
};

exports.cambioContrasenia = async (req, res) => {
  try {
    const { usuario, passwordActual, nuevaPassword, confirmarPassword } = req.body;

    if (!usuario || !passwordActual || !nuevaPassword || !confirmarPassword) {
      return res.status(400).json({ mensaje: "Todos los campos son obligatorios" });
    }

    const usuarioFound = await Usuario.findOne({ usuario });
    if (!usuarioFound) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    const passValido = await bcrypt.compare(passwordActual, usuarioFound.password);
    if (!passValido) {
      return res.status(400).json({ mensaje: "Credenciales incorrectas" });
    }

    if (nuevaPassword.length < 6) {
      return res.status(400).json({ mensaje: "La nueva contrasena debe tener al menos 6 caracteres" });
    }

    if (nuevaPassword !== confirmarPassword) {
      return res.status(400).json({ mensaje: "Las contrasenas nuevas no coinciden" });
    }

    const salt = await bcrypt.genSalt(10);
    usuarioFound.password = await bcrypt.hash(nuevaPassword, salt);
    await usuarioFound.save();

    await revokeAllUserSessions(usuarioFound._id, "password_changed");

    return res.json({ mensaje: "Contrasena actualizada correctamente" });
  } catch (error) {
    return res.status(500).json({ mensaje: "Error al cambiar la contrasena" });
  }
};

exports.rutaProtegida = (req, res) => {
  return res.json({ mensaje: "Ruta protegida de autenticacion" });
};
