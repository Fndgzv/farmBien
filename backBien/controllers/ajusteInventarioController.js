const InventarioFarmacia = require('../models/InventarioFarmacia');
const Producto = require('../models/Producto');


function construirFiltroProducto({ nombre, categoria, codigoBarras, inapam, generico }) {
    const filtros = { $and: [] };

    if (nombre) {
        const palabras = nombre.trim().split(/\s+/);
        filtros.$and.push({
            $or: palabras.map(p => ({ nombre: { $regex: p, $options: 'i' } }))
        });
    }

    if (categoria) {
        const palabrasCat = categoria.trim().split(/\s+/);
        filtros.$and.push({
            $or: palabrasCat.map(p => ({ categoria: { $regex: p, $options: 'i' } }))
        });
    }

    if (codigoBarras) {
        filtros.$and.push({ codigoBarras });
    }

    /* if (typeof inapam === 'string' && (inapam === 'true' || inapam === 'false')) {
        filtros.$and.push({ inapam: inapam === 'true' });
    }

    if (typeof generico === 'string' && (generico === 'true' || generico === 'false')) {
        filtros.$and.push({ generico: generico === 'true' });
    } */

    if (inapam === 'true' || inapam === 'false') {
        filtros.$and.push({ descuentoINAPAM: inapam === 'true' });
    }

    if (generico === 'true' || generico === 'false') {
        filtros.$and.push({ generico: generico === 'true' });
    }

    // Si no hay condiciones en $and, eliminarlo para evitar filtrado vacío
    if (filtros.$and.length === 0) {
        return {};
    }

    return filtros;
}

// Obtener inventario con filtros
exports.obtenerInventarioFarmacia = async (req, res) => {
    const { farmacia, nombre, codigoBarras, categoria, inapam, generico } = req.query;

    if (!farmacia) {
        return res.status(400).json({ mensaje: "Debe especificar una farmacia." });
    }

    try {
        const filtrosProducto = construirFiltroProducto({ nombre, categoria, codigoBarras, inapam, generico });
        const productos = await Producto.find(filtrosProducto).select('_id');
        const productosIds = productos.map(p => p._id);

        const inventario = await InventarioFarmacia.find({
            farmacia,
            producto: { $in: productosIds }
        }).populate('producto');

        res.json(inventario);
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener inventario", error });
    }
};


// Actualización masiva (existencia, stockMax y stockMin)
exports.actualizarInventarioMasivo = async (req, res) => {
    const farmacia = req.params.farmaciaId;
    const cambios = req.body; // Array con { id, existencia, stockMax, stockMin }

    if (!farmacia || !Array.isArray(cambios)) {
        return res.status(400).json({ mensaje: "Datos inválidos para actualización masiva." });
    }

    try {
        const resultados = [];

        for (const cambio of cambios) {
            const { id, existencia, stockMax, stockMin } = cambio;

            const updateData = {};

            if (existencia > 0) updateData.existencia = existencia;
            if (stockMax > 0) updateData.stockMax = stockMax;
            if (stockMin > 0) updateData.stockMin = stockMin;

            if (Object.keys(updateData).length === 0) {
                // No hay nada que actualizar
                continue;
            }

            const resUpdate = await InventarioFarmacia.findByIdAndUpdate(
                id,
                updateData,
                { new: true }
            );
            resultados.push(resUpdate);
        }

        res.json({ mensaje: "Ajuste masivo realizado con éxito", resultados });
    } catch (error) {
        console.error('Error en back al actualizar masivamente:', error);
        res.status(500).json({ mensaje: "Error al actualizar masivamente", error });
    }
};



// Actualización individual de un producto
exports.actualizarInventarioIndividual = async (req, res) => {
    const { id } = req.params;
    const { existencia, stockMax, stockMin, precioVenta } = req.body;

    try {
        const inventario = await InventarioFarmacia.findById(id);
        if (!inventario) {
            return res.status(404).json({ mensaje: "Registro no encontrado" });
        }

        if (existencia !== undefined) inventario.existencia = existencia;
        if (stockMax !== undefined) inventario.stockMax = stockMax;
        if (stockMin !== undefined) inventario.stockMin = stockMin;
        if (precioVenta !== undefined) inventario.precioVenta = precioVenta;

        await inventario.save();
        res.json({ mensaje: "Inventario actualizado", inventario });
    } catch (error) {
        res.status(500).json({ mensaje: "Error en la actualización individual", error });
    }
};
