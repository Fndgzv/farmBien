const ServicioMedico = require('../models/ServicioMedico');

exports.registrarServicioMedico = async (req, res) => {
    try {
        const { farmacia, medico, paciente, servicio, precio, receta } = req.body;
        const nuevoServicio = new ServicioMedico({ farmacia, medico, paciente, servicio, precio, receta });
        await nuevoServicio.save();
        res.status(201).json({ mensaje: "Servicio médico registrado exitosamente", servicio: nuevoServicio });
    } catch (error) {
        res.status(500).json({ mensaje: "Error al registrar servicio médico" });
    }
};