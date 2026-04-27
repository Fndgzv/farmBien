// usuarioController.js
const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const Usuario = require('../models/Usuario');
const Farmacia = require('../models/Farmacia');

const normalizarTexto = (valor) => {
    if (valor === undefined || valor === null) return undefined;
    const limpio = String(valor).trim();
    return limpio ? limpio : undefined;
};

exports.obtenerUsuarios = async (req, res) => {
    try {
        const usuarios = await Usuario.find().populate('farmacia', 'nombre');
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener usuarios" });
    }
};


// actualización de usuario por parte de un administrador
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
            cedulaProfesional,
            titulo,
            escuela
        } = req.body;

        const usuarioEncontrado = await Usuario.findById(id);
        if (!usuarioEncontrado) {
            return res.status(404).json({ mensaje: "Usuario no encontrado" });
        }

        const rolDestino = rol || usuarioEncontrado.rol;
        const farmaciaDestino = farmacia !== undefined && farmacia !== null && String(farmacia).trim()
            ? String(farmacia).trim()
            : (usuarioEncontrado.farmacia ? String(usuarioEncontrado.farmacia) : '');
        const cedulaDestino = cedulaProfesional !== undefined
            ? normalizarTexto(cedulaProfesional)
            : normalizarTexto(usuarioEncontrado.cedulaProfesional);
        const tituloDestino = titulo !== undefined
            ? normalizarTexto(titulo)
            : normalizarTexto(usuarioEncontrado.titulo);
        const escuelaDestino = escuela !== undefined
            ? normalizarTexto(escuela)
            : normalizarTexto(usuarioEncontrado.escuela);

        // Validar usuario nuevo si cambia
        if (usuario && usuario !== usuarioEncontrado.usuario) {
            const existeUsuario = await Usuario.findOne({ usuario });
            if (existeUsuario && existeUsuario._id.toString() !== id) {
                return res.status(400).json({ mensaje: "El nombre de usuario ya está en uso." });
            }
            usuarioEncontrado.usuario = usuario;
        }

        // Validar correo
        if (email && email !== usuarioEncontrado.email) {
            const emailExiste = await Usuario.findOne({ email });
            if (emailExiste && emailExiste._id.toString() !== id) {
                return res.status(400).json({ mensaje: "El correo electrónico ya está en uso." });
            }
            usuarioEncontrado.email = email;
        }

        // Validar teléfono
        if (telefono && telefono !== usuarioEncontrado.telefono) {
            const telefonoExiste = await Usuario.findOne({ telefono });
            if (telefonoExiste && telefonoExiste._id.toString() !== id) {
                return res.status(400).json({ mensaje: "El teléfono ya está en uso." });
            }
            usuarioEncontrado.telefono = telefono;
        }

        // Validar cambio de contraseña
        if (nuevaPassword && nuevaPassword.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            usuarioEncontrado.password = await bcrypt.hash(nuevaPassword, salt);
        }

        let farmaciaExistente = null;
        if (['medico', 'empleado', 'turnos', 'ajustaFarma'].includes(rolDestino)) {
            if (!farmaciaDestino) {
                const mensajes = {
                    medico: 'Un médico debe estar asignado a una farmacia.',
                    empleado: 'Un empleado debe estar asignado a una farmacia.',
                    turnos: 'Un usuario de turnos debe estar asignado a una farmacia.',
                    ajustaFarma: 'Un ajustador de farmacia debe tener una farmacia asignada.'
                };
                return res.status(400).json({ mensaje: mensajes[rolDestino] });
            }

            farmaciaExistente = await Farmacia.findById(farmaciaDestino);
            if (!farmaciaExistente) {
                return res.status(404).json({ mensaje: 'Farmacia no encontrada' });
            }
        }

        if (rolDestino === 'medico') {
            if (!cedulaDestino) {
                return res.status(400).json({ mensaje: 'La cédula profesional es obligatoria para médicos.' });
            }
            if (!tituloDestino) {
                return res.status(400).json({ mensaje: 'El título es obligatorio para médicos.' });
            }
            if (!escuelaDestino) {
                return res.status(400).json({ mensaje: 'La institución educativa es obligatoria para médicos.' });
            }
        }

        usuarioEncontrado.rol = rolDestino;

        if (rolDestino === 'medico') {
            usuarioEncontrado.farmacia = farmaciaExistente ? farmaciaExistente._id : farmaciaDestino;
            usuarioEncontrado.cedulaProfesional = cedulaDestino;
            usuarioEncontrado.titulo = tituloDestino;
            usuarioEncontrado.escuela = escuelaDestino;
        } else if (rolDestino === 'empleado' || rolDestino === 'turnos') {
            usuarioEncontrado.farmacia = farmaciaExistente ? farmaciaExistente._id : farmaciaDestino;
            usuarioEncontrado.cedulaProfesional = undefined;
            usuarioEncontrado.titulo = undefined;
            usuarioEncontrado.escuela = undefined;
        } else if (rolDestino === 'ajustaFarma') {
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

        // Actualizar otros campos
        usuarioEncontrado.nombre = nombre || usuarioEncontrado.nombre;
        usuarioEncontrado.domicilio = domicilio || usuarioEncontrado.domicilio;

        await usuarioEncontrado.save();

        const usuarioActualizado = await Usuario.findById(id).populate('farmacia', 'nombre direccion telefono');

        res.json({ mensaje: 'Usuario actualizado correctamente', usuario: usuarioActualizado });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al actualizar usuario', error });
    }
};

// registro de usuario por parte de un administrador
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
        cedulaProfesional,
        titulo,
        escuela
    } = req.body;

    const telefonoRegex = /^\d{10}$/;
    if (telefono && !telefonoRegex.test(telefono)) {
        return res.status(400).json({ mensaje: 'El teléfono debe contener exactamente 10 dígitos numéricos.' });
    }

    try {
        const usuarioExistente = await Usuario.findOne({ usuario });
        if (usuarioExistente) {
            return res.status(400).json({ mensaje: 'El nombre de usuario ya está registrado.' });
        }

        if (email) {
            const emailExistente = await Usuario.findOne({ email });
            if (emailExistente) {
                return res.status(400).json({ mensaje: 'El correo electrónico ya está en uso.' });
            }
        }

        if (telefono) {
            const telefonoExistente = await Usuario.findOne({ telefono });
            if (telefonoExistente) {
                return res.status(400).json({ mensaje: 'El teléfono ya está registrado por otro usuario.' });
            }
        }

        let farmaciaAsignada = null;
        const cedulaNormalizada = normalizarTexto(cedulaProfesional);
        const tituloNormalizado = normalizarTexto(titulo);
        const escuelaNormalizada = normalizarTexto(escuela);

        if (rol === 'medico') {
            if (!farmacia) {
                return res.status(400).json({ mensaje: 'Un médico debe estar asignado a una farmacia.' });
            }
            if (!cedulaNormalizada) {
                return res.status(400).json({ mensaje: 'La cédula profesional es obligatoria para médicos.' });
            }
            if (!tituloNormalizado) {
                return res.status(400).json({ mensaje: 'El título es obligatorio para médicos.' });
            }
            if (!escuelaNormalizada) {
                return res.status(400).json({ mensaje: 'La institución educativa es obligatoria para médicos.' });
            }
            farmaciaAsignada = await Farmacia.findById(farmacia);
            if (!farmaciaAsignada) {
                return res.status(404).json({ mensaje: 'Farmacia no encontrada' });
            }
        }

        if (rol === 'empleado') {
            if (!farmacia) {
                return res.status(400).json({ mensaje: 'Un empleado debe estar asignado a una farmacia.' });
            }
            farmaciaAsignada = await Farmacia.findById(farmacia);
            if (!farmaciaAsignada) {
                return res.status(404).json({ mensaje: 'Farmacia no encontrada' });
            }
        }

        if (rol === 'turnos') {
            if (!farmacia) {
                return res.status(400).json({ mensaje: 'Un usuario de turnos debe estar asignado a una farmacia.' });
            }
            farmaciaAsignada = await Farmacia.findById(farmacia);
            if (!farmaciaAsignada) {
                return res.status(404).json({ mensaje: 'Farmacia no encontrada' });
            }
        }

        if (rol === 'ajustaAlmacen' || rol === 'ajustaSoloAlmacen') {
            farmaciaAsignada = null;
        }

        if (rol === 'ajustaFarma') {
            if (!farmacia) {
                return res.status(400).json({ mensaje: 'Un usuario ajustaFarma debe estar asignado a una farmacia.' });
            }
            farmaciaAsignada = await Farmacia.findById(farmacia);

            if (!farmaciaAsignada) {
                return res.status(404).json({ mensaje: 'Farmacia no encontrada' });
            }
        }
        const hashedPassword = await bcrypt.hash(password, 10);

        const nuevoUsuario = new Usuario({
            usuario,
            nombre,
            telefono,
            email,
            password: hashedPassword,
            domicilio,
            rol,
            farmacia: farmaciaAsignada ? farmaciaAsignada._id : null,
            cedulaProfesional: rol === 'medico' ? cedulaNormalizada : undefined,
            titulo: rol === 'medico' ? tituloNormalizado : undefined,
            escuela: rol === 'medico' ? escuelaNormalizada : undefined,
        });

        await nuevoUsuario.save();

        const usuarioRegistrado = await Usuario.findById(nuevoUsuario._id)
            .populate('farmacia', 'nombre direccion telefono');

        res.status(201).json({ mensaje: 'Usuario registrado exitosamente', usuario: usuarioRegistrado });
    } catch (error) {
        console.error('❌ Error al registrar usuario:', error.message, error);
        res.status(500).json({ mensaje: 'Error en el servidor', error });
    }
};

