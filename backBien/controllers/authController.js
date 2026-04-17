// authController.js
const Usuario = require('../models/Usuario');
const Corte = require('../models/CorteCaja');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

/* ========================================================
   INICIAR SESIÓN
   Soporta roles:
   - admin
   - empleado
   - medico
   - ajustaAlmacen
   - ajustaFarma
   ======================================================== */
exports.iniciarSesion = async (req, res) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(400).json({ errores: errores.array() });
  }

  const { usuario, password, firma } = req.body;

  try {
    const usuarioExistente = await Usuario.findOne({ usuario })
      .populate('farmacia', 'nombre direccion telefono firmaHash titulo1 titulo2 imagen imagen2');

    if (!usuarioExistente) {
      return res.status(400).json({ mensaje: 'Credenciales incorrectas' });
    }

    /* ======================
       VALIDAR PASSWORD
       ====================== */
    const esCorrecto = await bcrypt.compare(password, usuarioExistente.password);
    if (!esCorrecto) {
      return res.status(400).json({ mensaje: 'Credenciales incorrectas' });
    }

    const rol = usuarioExistente.rol;
    const farmaciaAsociada = usuarioExistente.farmacia;

    /* ==========================================================
       BLOQUE 1 — ROLES SIN FARMACIA Y SIN FIRMA
       - admin: selecciona farmacia luego
       - ajustaAlmacen: inventario general
       ========================================================== */
    if (rol === "admin" || rol === "ajustaAlmacen" || rol === "ajustaSoloAlmacen") {

      const token = jwt.sign(
        { id: usuarioExistente.id, rol: usuarioExistente.rol },
        process.env.JWT_SECRET,
        { expiresIn: '12h' }
      );

      return res.json({
        token,
        user: {
          id: usuarioExistente._id,
          nombre: usuarioExistente.nombre,
          rol: usuarioExistente.rol,
          telefono: usuarioExistente.telefono,
          email: usuarioExistente.email || '',
          domicilio: usuarioExistente.domicilio || '',
          cedulaProfesional: usuarioExistente.cedulaProfesional || '',
          titulo: usuarioExistente.titulo || '',
          escuela: usuarioExistente.escuela || '',
          farmacia: null  // admin decide luego, ajustaAlmacen no ocupa
        }
      });
    }

    /* ==========================================================
       BLOQUE 2 — ROLES QUE SÍ REQUIEREN FARMACIA
       empleado, medico, ajustaFarma
       ========================================================== */
    const rolesConFarmacia = ["empleado", "medico", "ajustaFarma"];

    if (rolesConFarmacia.includes(rol) && !farmaciaAsociada) {
      return res.status(409).json({
        mensaje: "El usuario no tiene una farmacia asociada"
      });
    }

    /* ==========================================================
       BLOQUE 3 — ROLES QUE REQUIEREN FIRMA
       SOLO empleado y medico
       (ajustaFarma NO requiere firma)
       ========================================================== */
    const rolesQueRequierenFirma = ["empleado", "medico"];

    if (rolesQueRequierenFirma.includes(rol)) {

      // ⬇️ Verificar si hay corte activo
      const corteActivo = await Corte.findOne({
        usuario: usuarioExistente._id,
        farmacia: farmaciaAsociada._id,
        $or: [{ fechaFin: { $exists: false } }, { fechaFin: null }]
      });

      // ⬇️ Si NO hay corte → se pide firma
      if (!corteActivo) {
        if (!firma || firma.trim() === '') {
          return res.status(401).json({
            mensaje: 'Se requiere la firma de la farmacia para iniciar sesión.',
            requiereFirma: true
          });
        }

        /* ===== Validación segura del hash ===== */
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
            mensaje: 'Firma incorrecta. Verifica con la farmacia.',
            requiereFirma: true
          });
        }
      }
    }

    /* ==========================================================
       BLOQUE 4 — ROLES NORMALES (empleado, medico, ajustaFarma)
       Emitir token y regresar farmacia
       ========================================================== */
    const payload = { id: usuarioExistente.id, rol: usuarioExistente.rol };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });

    return res.json({
      token,
      user: {
        id: usuarioExistente._id,
        nombre: usuarioExistente.nombre,
        rol: usuarioExistente.rol,
        telefono: usuarioExistente.telefono,
        email: usuarioExistente.email || '',
        domicilio: usuarioExistente.domicilio || '',
        cedulaProfesional: usuarioExistente.cedulaProfesional || '',
        titulo: usuarioExistente.titulo || '',
        escuela: usuarioExistente.escuela || '',
        farmacia: farmaciaAsociada ? {
          _id: farmaciaAsociada._id,
          nombre: farmaciaAsociada.nombre,
          direccion: farmaciaAsociada.direccion,
          telefono: farmaciaAsociada.telefono,
          titulo1: farmaciaAsociada.titulo1,
          titulo2: farmaciaAsociada.titulo2,
          imagen: farmaciaAsociada.imagen,
          imagen2: farmaciaAsociada.imagen2
        } : null
      }
    });

  } catch (error) {
    console.error('❌ Error en iniciarSesion:', error);
    return res.status(500).json({ mensaje: 'Error en el servidor' });
  }
};


/* ========================================================
   OBTENER DATOS DE USUARIO AUTENTICADO
   ======================================================== */
exports.datosUsuarioAutenticado = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select("-password");
    if (!usuario) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }
    res.json({ usuario });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener datos del usuario", error });
  }
};

// usuario autenticado actualiza sus propios datos
exports.actualizarDatosUsuarioAutenticado = async (req, res) => {
  try {
    const { usuario, nombre, email, domicilio, telefono, password } = req.body;

    if (!usuario || !password || password.trim() === "") {
      return res.status(400).json({ mensaje: "Usuario y contraseña son obligatorios" });
    }

    const userFound = await Usuario.findById(req.usuario.id);

    if (!userFound) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    const isMatch = await bcrypt.compare(password, userFound.password);
    if (!isMatch) {
      return res.status(401).json({ mensaje: "Credenciales incorrectas" });
    }

    // Verificar si el nuevo nombre de usuario ya está en uso por otro
    if (usuario !== userFound.usuario) {
      const usuarioExistente = await Usuario.findOne({ usuario });
      if (usuarioExistente && usuarioExistente._id.toString() !== userFound._id.toString()) {
        return res.status(400).json({ mensaje: "El nombre de usuario ya está en uso" });
      }
      userFound.usuario = usuario;
    }

    // Verificar si el nuevo teléfono ya está en uso por otro
    if (telefono && telefono !== userFound.telefono) {
      const telefonoExistente = await Usuario.findOne({ telefono });
      if (telefonoExistente && telefonoExistente._id.toString() !== userFound._id.toString()) {
        return res.status(400).json({ mensaje: "El teléfono ya está registrado por otro usuario" });
      }
      userFound.telefono = telefono;
    }

    userFound.nombre = nombre || userFound.nombre;
    userFound.email = email || userFound.email;
    userFound.domicilio = domicilio || userFound.domicilio;

    await userFound.save();

    res.json({
      mensaje: "Datos actualizados correctamente",
      usuario: {
        id: userFound._id,
        usuario: userFound.usuario,
        nombre: userFound.nombre,
        rol: userFound.rol,
        email: userFound.email,
        telefono: userFound.telefono,
        domicilio: userFound.domicilio,
        cedulaProfesional: userFound.cedulaProfesional || '',
        titulo: userFound.titulo || '',
        escuela: userFound.escuela || ''
      }
    });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al actualizar datos" });
  }
};


// usuario autenticado cambio su contraseña
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
      return res.status(400).json({ mensaje: "La nueva contraseña debe tener al menos 6 caracteres" });
    }

    if (nuevaPassword !== confirmarPassword) {
      return res.status(400).json({ mensaje: "Las contraseñas nuevas no coinciden" });
    }

    const salt = await bcrypt.genSalt(10);
    usuarioFound.password = await bcrypt.hash(nuevaPassword, salt);
    await usuarioFound.save();

    res.json({ mensaje: "Contraseña actualizada correctamente" });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al cambiar la contraseña" });
  }
};


// ruta protegida
exports.rutaProtegida = (req, res) => {
  res.json({ mensaje: "Ruta protegida de autenticación" });
};


