// backBien/controllers/inventarioFisico.controller.js
const InventarioFisico = require("../models/InventarioFisico");
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");

exports.exportarExcel = async (req, res) => {
  try {
    const {
      farmacia,
      almacen,
      producto,
      usuario,
      desde,
      hasta
    } = req.query;

    const filtro = {};

    // 📌 FILTRO DE FARMACIA
    if (farmacia) filtro.farmaNombre = farmacia;
    if (almacen === "true") filtro.farmaNombre = "Almacén";

    // 📌 FILTRO DE PRODUCTO
    if (producto && mongoose.isValidObjectId(producto)) {
      filtro.producto = producto;
    }

    // 📌 FILTRO DE USUARIO
    if (usuario) filtro.usuario = usuario;

    // 📌 FILTRO DE FECHAS
    if (desde || hasta) {
      filtro.fechaInv = {};
      if (desde) filtro.fechaInv.$gte = new Date(desde + "T00:00:00");
      if (hasta) filtro.fechaInv.$lte = new Date(hasta + "T23:59:59");
    }

    const registros = await InventarioFisico.find(filtro)
      .populate("producto", "nombre codigoBarras categoria costo")
      .populate("usuario", "nombre usuario");

    // 🧾 Crear archivo Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventario Físico");

    // ENCABEZADOS
    sheet.addRow([
      "Fecha",
      "Farmacia",
      "Producto",
      "Código Barras",
      "Sistema",
      "Físico",
      "Diferencia",
      "Costo Perdida",
      "Usuario"
    ]);

    registros.forEach((r) => {
      sheet.addRow([
        r.fechaInv?.toLocaleString("es-MX") ?? "",
        r.farmaNombre ?? "",
        r.producto?.nombre ?? "",
        r.producto?.codigoBarras ?? "",

        // 🔥 CAMPOS CORRECTOS:
        Number(r.existenciaSistema ?? 0),
        Number(r.existenciaFisica ?? 0),

        // 🔥 DIFERENCIA REAL
        Number((r.existenciaFisica ?? 0) - (r.existenciaSistema ?? 0)),

        Number(r.perdida ?? 0),
        r.usuario?.nombre ?? ""
      ]);
    });

    sheet.columns.forEach(col => { col.width = 25 });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=inventario-fisico.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("❌ Error al exportar Excel:", err);
    res.status(500).json({ mensaje: "No se pudo generar el Excel" });
  }
};


exports.obtenerInventarioFisico = async (req, res) => {
  try {
    const {
      farmacia,
      almacen,
      producto,
      usuario,
      desde,
      hasta,
      sortBy = "fechaInv",
      sortDir = "desc",
      page = 1,
      limit = 50
    } = req.query;

    const filtro = {};

    /* =====================================================
       📌 FILTRO POR FARMACIA
    ====================================================== */
    if (farmacia) {
      filtro.farmaNombre = farmacia;
    }

    /* =====================================================
       📦 FILTRO EXCLUSIVO PARA ALMACÉN
    ====================================================== */
    if (almacen === "true") {
      filtro.farmaNombre = "Almacén";
    }

    /* =====================================================
       🔍 FILTRO POR PRODUCTO
    ====================================================== */
    if (producto && mongoose.isValidObjectId(producto)) {
      filtro.producto = producto;
    }

    if (usuario) filtro.usuario = usuario;

    /* =====================================================
       📅 RANGO DE FECHAS
    ====================================================== */
    if (desde || hasta) {
      filtro.fechaInv = {};

      if (desde) filtro.fechaInv.$gte = new Date(desde + "T00:00:00");
      if (hasta) filtro.fechaInv.$lte = new Date(hasta + "T23:59:59");
    }

    /* =====================================================
       📄 PAGINACIÓN
    ====================================================== */
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit) || 50, 1), 300);
    const skip = (pageNum - 1) * limitNum;

    /* =====================================================
       🔎 CONSULTAR REGISTROS
    ====================================================== */
    const registros = await InventarioFisico.find(filtro)
      .populate('usuario', 'nombre')
      .populate("producto", "nombre codigoBarras categoria costo")
      .sort({ [sortBy]: sortDir === "asc" ? 1 : -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await InventarioFisico.countDocuments(filtro);

    res.json({
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      limit: limitNum,
      resultados: registros
    });

  } catch (error) {
    console.error("❌ Error obtenerInventarioFisico:", error);
    res.status(500).json({ mensaje: "Error al consultar el inventario físico." });
  }
};

// GET /api/usuarios/buscar?q=texto
exports.buscarUsuarios = async (req, res) => {
  try {
    const q = req.query.q || '';
    const regex = new RegExp(q, 'i');

    const usuarios = await Usuario.find({
      nombre: regex
    }).select('_id nombre usuario');

    res.json(usuarios);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al buscar usuarios' });
  }
};
