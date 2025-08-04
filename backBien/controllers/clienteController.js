// controllers/clienteController.js
const bcrypt = require("bcryptjs");
const Cliente = require("../models/Cliente");

// Obtener todos los clientes
exports.obtenerClientes = async (req, res) => {
    try {
        const clientes = await Cliente.find();
        res.json(clientes);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener clientes" });
    }
};


exports.obtenerClientePorId = async (req, res) => {
  try {
    const { clienteId } = req.params;
    const cliente = await Cliente.findById(clienteId);

    if (!cliente) {
      return res.status(404).json({ mensaje: "Cliente no encontrado" });
    }

    res.json(cliente);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener el cliente" });
  }
};

// 🔹 Buscar cliente por teléfono
exports.buscarClientePorTelefono = async (req, res) => {
    try {
        const { telefono } = req.params;

        // Validar que el teléfono tenga 10 dígitos
        if (!telefono || !/^\d{10}$/.test(telefono)) {
            return res.status(400).json({ mensaje: "Número de teléfono inválido" });
        }

        const cliente = await Cliente.findOne({ telefono }).select("_id nombre telefono totalMonedero");

        if (!cliente) {
            return res.status(404).json({ mensaje: "Cliente no encontrado" });
        }

        res.json(cliente);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: "Error al buscar cliente por teléfono" });
    }
};


// Crear un nuevo cliente, desde una venta, con telefono y nombre
exports.crearClienteDesdeVenta = async (req, res) => {
    try {
        const { nombre, telefono } = req.body;

        if (!nombre || !telefono) {
            return res.status(400).json({ mensaje: "Nombre y teléfono son obligatorios" });
        }

        let clienteExistente = await Cliente.findOne({ telefono });
        if (clienteExistente) {
            return res.status(400).json({ mensaje: "El cliente ya está registrado" });
        }

        // 🔹 Encriptar la contraseña
        const hashedPassword = await bcrypt.hash(telefono, 10);

        const nuevoCliente = new Cliente({
            nombre,
            telefono,
            password: hashedPassword, // Se asigna el teléfono encriptado como contraseña por defecto
        });
        await nuevoCliente.save();
        res.status(201).json(nuevoCliente);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: "Error al crear cliente" });
    }
};



