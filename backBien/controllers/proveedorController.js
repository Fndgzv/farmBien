const Proveedor = require('../models/Proveedor');

exports.obtenerProveedores = async (req, res) => {
    try {
        const proveedores = await Proveedor.find();
        res.json(proveedores);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener proveedores" });
    }
};


exports.crearProveedor = async (req, res) => {
    try {
        const { nombre, contacto, telefono, domicilio } = req.body;
        const nuevoProveedor = new Proveedor({ nombre, contacto, telefono, domicilio });
        await nuevoProveedor.save();
        res.status(201).json({ mensaje: "Proveedor agregado exitosamente" });
    } catch (error) {
        res.status(500).json({ mensaje: "Error al agregar proveedor" });
    }
};

exports.actualizarProveedor = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, contacto, telefono, domicilio } = req.body;

    const proveedor = await Proveedor.findByIdAndUpdate(
      id,
      { nombre, contacto, telefono, domicilio },
      { new: true }
    );

    if (!proveedor) {
      return res.status(404).json({ mensaje: "Proveedor no encontrado" });
    }

    res.json({ mensaje: "Proveedor actualizado correctamente", proveedor });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al actualizar proveedor", error });
  }
};
