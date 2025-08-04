// usuarioController.js
const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const Usuario = require('../models/Usuario');
const Farmacia = require('../models/Farmacia');

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
        const { usuario, nombre, password, nuevaPassword, email, telefono, domicilio, rol, farmacia, cedulaProfesional } = req.body;

        let usuarioEncontrado = await Usuario.findById(id);
        if (!usuarioEncontrado) {
            return res.status(404).json({ mensaje: "Usuario no encontrado" });
        }

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
        if (nuevaPassword) {
            const esIgual = await bcrypt.compare(nuevaPassword, usuarioEncontrado.password);
            if (esIgual) {
                return res.status(400).json({ mensaje: "La nueva contraseña no puede ser igual a la actual." });
            }
            const salt = await bcrypt.genSalt(10);
            usuarioEncontrado.password = await bcrypt.hash(nuevaPassword, salt);
        }

        // Validaciones y lógica según el nuevo rol
        if (rol) {
            if (rol === 'admin') {
                usuarioEncontrado.farmacia = null;
                usuarioEncontrado.cedulaProfesional = undefined;
            }

            if (rol === 'medico') {
                if (!farmacia) {
                    return res.status(400).json({ mensaje: "Un médico debe estar asignado a una farmacia." });
                }
                if (!cedulaProfesional) {
                    return res.status(400).json({ mensaje: "La cédula profesional es obligatoria para médicos." });
                }
                usuarioEncontrado.farmacia = farmacia;
                usuarioEncontrado.cedulaProfesional = cedulaProfesional;
            }

            if (rol === 'empleado') {
                if (!farmacia) {
                    return res.status(400).json({ mensaje: "Un empleado debe estar asignado a una farmacia." });
                }
                usuarioEncontrado.farmacia = farmacia;
                usuarioEncontrado.cedulaProfesional = undefined;
            }

            usuarioEncontrado.rol = rol;
        }

        // Validar farmacia si se indica aparte del cambio de rol
        if (farmacia && !['medico', 'empleado'].includes(rol)) {
            const farmaciaExistente = await Farmacia.findById(farmacia);
            if (!farmaciaExistente) {
                return res.status(404).json({ mensaje: "Farmacia no encontrada" });
            }
            usuarioEncontrado.farmacia = farmacia;
        }

        // Actualizar otros campos
        usuarioEncontrado.nombre = nombre || usuarioEncontrado.nombre;
        usuarioEncontrado.domicilio = domicilio || usuarioEncontrado.domicilio;

        await usuarioEncontrado.save();

        const usuarioActualizado = await Usuario.findById(id).populate('farmacia', 'nombre direccion telefono');

        res.json({ mensaje: "Usuario actualizado correctamente", usuario: usuarioActualizado });
    } catch (error) {
        res.status(500).json({ mensaje: "Error al actualizar usuario", error });
    }
};

// registro de usuario por parte de un administrador
exports.registrarUsuario = async (req, res) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
        return res.status(400).json({ errores: errores.array() });
    }

    const { usuario, nombre, telefono, email, password, domicilio, rol, farmacia, cedulaProfesional } = req.body;

    const telefonoRegex = /^\d{10}$/;
    if (telefono && !telefonoRegex.test(telefono)) {
        return res.status(400).json({ mensaje: "El teléfono debe contener exactamente 10 dígitos numéricos." });
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

        if (rol === 'medico') {
            if (!farmacia) {
                return res.status(400).json({ mensaje: "Un médico debe estar asignado a una farmacia." });
            }
            if (!cedulaProfesional) {
                return res.status(400).json({ mensaje: "La cédula profesional es obligatoria para médicos." });
            }
            farmaciaAsignada = await Farmacia.findById(farmacia);
            if (!farmaciaAsignada) {
                return res.status(404).json({ mensaje: 'Farmacia no encontrada' });
            }
        }

        if (rol === 'empleado') {
            if (!farmacia) {
                return res.status(400).json({ mensaje: "Un empleado debe estar asignado a una farmacia." });
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
            cedulaProfesional: rol === 'medico' ? cedulaProfesional : undefined
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

