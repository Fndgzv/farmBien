// backBien/controllers/etiquetasController.js
const EtiquetaDiseno = require('../models/LabelDesign');
const Producto = require('../models/Producto'); // tu modelo existente
const { Types } = require('mongoose');

exports.listarDisenos = async (req, res) => {
  const rows = await EtiquetaDiseno.find().sort({ nombre: 1 });
  res.json(rows);
};

exports.obtenerDiseno = async (req, res) => {
  const row = await EtiquetaDiseno.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'No encontrado' });
  res.json(row);
};

exports.crearDiseno = async (req, res) => {
  const creado = await EtiquetaDiseno.create(req.body);
  res.status(201).json(creado);
};

exports.actualizarDiseno = async (req, res) => {
  const { id } = req.params;
  const upd = await EtiquetaDiseno.findByIdAndUpdate(id, req.body, { new: true });
  if (!upd) return res.status(404).json({ message: 'No encontrado' });
  res.json(upd);
};

exports.eliminarDiseno = async (req, res) => {
  const { id } = req.params;
  const del = await EtiquetaDiseno.findByIdAndDelete(id);
  if (!del) return res.status(404).json({ message: 'No encontrado' });
  res.json({ ok: true });
};

/**
 * Catálogo de productos con precioVenta por farmacia
 * GET /api/etiquetas/productos?farmaciaId=...&q=...&categoria=...&page=1&limit=20
 */
exports.catalogoProductos = async (req, res) => {
  try {
    const { farmaciaId, q, categoria, page = 1, limit = 20 } = req.query;

    if (!farmaciaId) return res.status(400).json({ message: 'farmaciaId requerido' });

    const match = {};
    if (q && q.trim()) {
      match.nombre = { $regex: q.trim(), $options: 'i' };
    }
    if (categoria && categoria.trim()) {
      match.categoria = categoria.trim();
    }

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const lim = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

    const pipeline = [
      { $match: match },
      { $project: { nombre: 1, categoria: 1, codigoBarras: 1, renglon1: 1, renglon2: 1 } },
      {
        $lookup: {
          from: 'inventariofarmacias',
          let: { pid: '$_id' },
          pipeline: [
            { $match: { 
              $expr: { 
                $and: [
                  { $eq: ['$producto', '$$pid'] },
                  { $eq: ['$farmacia', new Types.ObjectId(farmaciaId)] }
                ]
              }
            }},
            { $project: { precioVenta: 1 } },
            { $limit: 1 }
          ],
          as: 'inv'
        }
      },
      { $addFields: { precioVenta: { $ifNull: [{ $arrayElemAt: ['$inv.precioVenta', 0] }, null] } } },
      { $project: { inv: 0 } },
      { $sort: { nombre: 1 } },
      {
        $facet: {
          rows: [
            { $skip: (pageNum - 1) * lim },
            { $limit: lim }
          ],
          paginacion: [
            { $count: 'total' }
          ]
        }
      }
    ];

    const [agg] = await Producto.aggregate(pipeline);
    const total = agg?.paginacion?.[0]?.total ?? 0;

    res.json({
      paginacion: { page: pageNum, limit: lim, total },
      rows: agg?.rows ?? []
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error al consultar productos' });
  }
};
