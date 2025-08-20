// backBien\controllers\farmaciaController.js

const bcrypt = require('bcryptjs');
const Farmacia = require('../models/Farmacia');
const Usuario = require('../models/Usuario'); // para verificar al admin

exports.obtenerFarmacias = async (_req, res) => {
  try {
    // Excluir firmaHash en listados
    const farmacias = await Farmacia.find({ activo: true }).select('-firmaHash');
    res.json(farmacias);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener farmacias" });
  }
};

exports.crearFarmacia = async (req, res) => {
  try {
    const { nombre, direccion, telefono, contacto, firma } = req.body;

    if (!firma || !firma.trim()) {
      return res.status(400).json({ mensaje: "La firma es obligatoria" });
    }

    const salt = await bcrypt.genSalt(10);
    const firmaHash = await bcrypt.hash(firma, salt);

    const nuevaFarmacia = new Farmacia({
      nombre,
      direccion,
      telefono,
      contacto,
      firmaHash
    });

    await nuevaFarmacia.save();

    // Respuesta sin exponer hash
    const json = nuevaFarmacia.toJSON(); // ya oculta firmaHash por el toJSON del schema
    res.status(201).json({ mensaje: "Farmacia creada exitosamente", farmacia: json });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error al crear farmacia" });
  }
};

exports.actualizarFarmacia = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, direccion, telefono, contacto, firmaActual, nuevaFirma } = req.body;

    const updates = { nombre, direccion, telefono, contacto };

    const farmacia = await Farmacia.findById(id);
    if (!farmacia) return res.status(404).json({ mensaje: "Farmacia no encontrada" });

    // ¿Quieren cambiar firma?
    if (typeof nuevaFirma === 'string' && nuevaFirma.trim()) {
      if (!firmaActual || !firmaActual.trim()) {
        return res.status(400).json({ mensaje: "Debes proporcionar la firma actual para cambiarla" });
      }
      if (nuevaFirma.trim().length < 6) {
        return res.status(400).json({ mensaje: "La nueva firma debe tener al menos 6 caracteres" });
      }

      // 1) Validar firma actual
      const okActual = await bcrypt.compare(firmaActual.trim(), farmacia.firmaHash);
      if (!okActual) {
        return res.status(401).json({ mensaje: "La firma actual es incorrecta" });
      }

      // 2) Asegurar que la nueva sea distinta a la actual
      const esIgual = await bcrypt.compare(nuevaFirma.trim(), farmacia.firmaHash);
      if (esIgual) {
        return res.status(400).json({ mensaje: "La nueva firma no puede ser igual a la actual" });
      }

      // 3) Re-hash y set
      const salt = await bcrypt.genSalt(10);
      updates.firmaHash = await bcrypt.hash(nuevaFirma.trim(), salt);
      updates.firmaUpdatedAt = new Date();
      updates.firmaVersion = (farmacia.firmaVersion || 1) + 1;
      updates.firmaUpdatedBy = req.usuario?.id || null;
    }

    const farmaciaActualizada = await Farmacia.findByIdAndUpdate(id, { $set: updates }, { new: true })
      .select('-firmaHash');
    res.json({ mensaje: "Farmacia actualizada correctamente", farmacia: farmaciaActualizada });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error al actualizar la farmacia", error });
  }
};


exports.obtenerFarmaciaPorId = async (req, res) => {
  try {
    // Excluir firmaHash explícitamente por seguridad
    const farmacia = await Farmacia.findById(req.params.id).select('-firmaHash');
    if (!farmacia) {
      return res.status(404).json({ mensaje: "Farmacia no encontrada" });
    }
    res.json(farmacia);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener farmacia" });
  }
};

// 🔒 Deprecado: ya no se expone la firma (ni hash)
exports.obtenerFirma = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaActiva = await Farmacia.findById(id).select('nombre activo');
    if (!farmaActiva) {
      return res.status(404).json({ mensaje: "Farmacia no encontrada" });
    }

    // Mantener compatibilidad sin filtrar secreto
    return res.status(200).json({
      mensaje: "La firma no se expone por seguridad",
      nombre: farmaActiva.nombre,
      requiereFirma: true
    });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al consultar la firma de la farmacia", error });
  }
};


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

exports.cambiarFirma = async (req, res) => {
  try {
    const { id } = req.params; // farmaciaId
    const { adminPassword, nuevaFirma } = req.body;
    const adminId = req.usuario?.id;

    if (!adminId) return res.status(401).json({ mensaje: 'No autenticado' });
    if (!nuevaFirma || !nuevaFirma.trim()) {
      return res.status(400).json({ mensaje: 'La nueva firma es obligatoria' });
    }
    if (!adminPassword) {
      return res.status(400).json({ mensaje: 'Debes confirmar con tu contraseña de administrador' });
    }

    const admin = await Usuario.findById(adminId);
    if (!admin || admin.rol !== 'admin') {
      return res.status(403).json({ mensaje: 'Solo un administrador puede cambiar la firma' });
    }

    const passOk = await bcrypt.compare(adminPassword, admin.password);
    if (!passOk) {
      return res.status(401).json({ mensaje: 'Contraseña de administrador incorrecta' });
    }

    const farmacia = await Farmacia.findById(id);
    if (!farmacia) return res.status(404).json({ mensaje: 'Farmacia no encontrada' });

    const salt = await bcrypt.genSalt(10);
    farmacia.firmaHash = await bcrypt.hash(nuevaFirma.trim(), salt);
    // Metadatos de auditoría (añade estos campos al modelo si quieres)
    farmacia.firmaUpdatedAt = new Date();
    farmacia.firmaUpdatedBy = admin._id;
    farmacia.firmaVersion = (farmacia.firmaVersion || 0) + 1;

    await farmacia.save();

    return res.json({
      mensaje: 'Firma actualizada correctamente',
      firmaUpdatedAt: farmacia.firmaUpdatedAt,
      firmaVersion: farmacia.firmaVersion
    });
  } catch (error) {
    console.error('Error al cambiar firma:', error);
    res.status(500).json({ mensaje: 'Error al cambiar la firma' });
  }
};
