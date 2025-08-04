const Farmacia = require('../models/Farmacia');

exports.obtenerFarmacias = async (req, res) => {
    try {
        const farmacias = await Farmacia.find({ activo: true }); // Solo activas
        res.json(farmacias);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener farmacias" });
    }
};

exports.crearFarmacia = async (req, res) => {
    try {
        const { nombre, direccion, telefono, firma } = req.body;
        const nuevaFarmacia = new Farmacia({ nombre, direccion, telefono, firma });
        await nuevaFarmacia.save();
        res.status(201).json({ mensaje: "Farmacia creada exitosamente" });
    } catch (error) {
        res.status(500).json({ mensaje: "Error al crear farmacia" });
    }
};

exports.actualizarFarmacia = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, direccion, telefono, firma } = req.body;

        const farmaciaActualizada = await Farmacia.findByIdAndUpdate(
            id,
            { nombre, direccion, telefono, firma },
            { new: true } // Devuelve el nuevo documento actualizado
        );

        if (!farmaciaActualizada) {
            return res.status(404).json({ mensaje: "Farmacia no encontrada" });
        }

        res.json({ mensaje: "Farmacia actualizada correctamente", farmacia: farmaciaActualizada });
    } catch (error) {
        res.status(500).json({ mensaje: "Error al actualizar la farmacia", error });
    }
};

exports.obtenerFarmaciaPorId = async (req, res) => {
    try {
        const farmacia = await Farmacia.findById(req.params.id);
        if (!farmacia) {
            return res.status(404).json({ mensaje: "Farmacia no encontrada" });
        }
        res.json(farmacia);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener farmacia" });
    }
};

exports.obtenerFirma = async (req, res) => {
    try {
        const { id } = req.params;
        const farmaActiva = await Farmacia.findById(id);
        if (!farmaActiva) {
            return res.status(404).json({ mensaje: "Farmacia no encontrada" });
        }
        res.status(200).json({
            mensaje: "Firma de la farmacia encontrada exitosamente",
            nombre: farmaActiva.nombre,
            firma: farmaActiva.firma
        });
    } catch (error) {
        res.status(500).json({ mensaje: "Error al buscar la firma de la farmacia", error });
    }
}

exports.eliminarFarmacia = async (req, res) => {
    try {
        const { id } = req.params;

        const farmacia = await Farmacia.findById(id);
        if (!farmacia) {
            return res.status(404).json({ mensaje: "Farmacia no encontrada" });
        }

        farmacia.activo = false;
        await farmacia.save();

        res.json({ mensaje: "Farmacia desactivada correctamente" });
    } catch (error) {
        res.status(500).json({ mensaje: "Error al desactivar la farmacia", error });
    }
};

