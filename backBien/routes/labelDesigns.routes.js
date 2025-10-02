// backBien/routes/labelDesigns.routes.js
const router = require('express').Router();
const LabelDesign = require('../models/LabelDesign');

// ✅ Usa tus middlewares reales
const authMiddleware = require('../middlewares/authMiddleware');
const isAdmin = require('../middlewares/isAdmin');

// Crear (solo admin)
router.post('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const doc = await LabelDesign.create({
      ...req.body,
      // ✅ tu auth coloca el usuario en req.usuario, no en req.user
      creadoPor: req.usuario._id
    });
    res.json(doc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Listar diseños (solo admin)
router.get('/', authMiddleware, isAdmin, async (req, res) => {
  const docs = await LabelDesign.find().sort({ nombre: 1 });
  res.json(docs);
});

// Obtener uno (solo admin)
router.get('/:id', authMiddleware, isAdmin, async (req, res) => {
  const doc = await LabelDesign.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'No encontrado' });
  res.json(doc);
});

// Actualizar (solo admin)
router.put('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const doc = await LabelDesign.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    res.json(doc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Eliminar (solo admin)
router.delete('/:id', authMiddleware, isAdmin, async (req, res) => {
  const r = await LabelDesign.findByIdAndDelete(req.params.id);
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

module.exports = router;
