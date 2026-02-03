/* backBien/scripts/reporte_ventas_producto_mes_ago2025_ene2026.js */
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");

const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/farmBien";

const TZ = "America/Mexico_City";

// Meses a reportar (etiqueta -> YYYY-MM)
const MESES = [
  { label: "Ago 2025", ym: "2025-08" },
  { label: "Sep 2025", ym: "2025-09" },
  { label: "Oct 2025", ym: "2025-10" },
  { label: "Nov 2025", ym: "2025-11" },
  { label: "Dic 2025", ym: "2025-12" },
  { label: "Ene 2026", ym: "2026-01" },
];

// Rango global (incluye todos los meses) en “calendario CDMX”
// Usamos $dateTrunc/$dateToString con timezone para agrupar, pero filtramos por un rango amplio seguro:
const START_UTC = new Date("2025-08-01T00:00:00.000Z"); // filtro amplio, la agrupación manda
const END_UTC   = new Date("2026-02-01T00:00:00.000Z");

async function main() {
  console.log("Conectando a MongoDB...");
  await mongoose.connect(MONGO, { autoIndex: false });
  console.log("Conectado:", MONGO);

  const Venta = require("../models/Venta");

  console.log("Agregando datos...");

  // Construye sums condicionales por mes
  const monthSums = MESES.reduce((acc, m) => {
    acc[m.label] = {
      $sum: {
        $cond: [{ $eq: ["$_id.ym", m.ym] }, "$qty", 0],
      },
    };
    return acc;
  }, {});

  const pipeline = [
    // 1) Filtra ventas por rango general (la agrupación por mes se hace en CDMX)
    {
      $match: {
        fecha: { $gte: START_UTC, $lt: END_UTC },
      },
    },

    // 2) Unwind productos
    { $unwind: "$productos" },

    // 3) Agrupa por farmacia + producto + mes (CDMX)
    {
      $group: {
        _id: {
          farmacia: "$farmacia",
          producto: "$productos.producto",
          ym: {
            $dateToString: {
              date: "$fecha",
              format: "%Y-%m",
              timezone: TZ,
            },
          },
        },
        qty: { $sum: "$productos.cantidad" },
      },
    },

    // 4) Ahora pivotea a columnas por mes (por farmacia+producto)
    {
      $group: {
        _id: {
          farmacia: "$_id.farmacia",
          producto: "$_id.producto",
        },
        ...monthSums,
      },
    },

    // 5) Lookup farmacia
    {
      $lookup: {
        from: "farmacias",
        localField: "_id.farmacia",
        foreignField: "_id",
        as: "farmaciaDoc",
      },
    },

    // 6) Lookup producto
    {
      $lookup: {
        from: "productos",
        localField: "_id.producto",
        foreignField: "_id",
        as: "productoDoc",
      },
    },

    // 7) Proyecta columnas finales
    {
      $project: {
        _id: 0,
        nombreFarmacia: { $ifNull: [{ $first: "$farmaciaDoc.nombre" }, "—"] },
        nombreProducto: { $ifNull: [{ $first: "$productoDoc.nombre" }, "—"] },
        codigoBarras: { $ifNull: [{ $first: "$productoDoc.codigoBarras" }, "" ] },
        categoria: { $ifNull: [{ $first: "$productoDoc.categoria" }, "" ] },

        // Meses
        "Ago 2025": { $ifNull: ["$Ago 2025", 0] },
        "Sep 2025": { $ifNull: ["$Sep 2025", 0] },
        "Oct 2025": { $ifNull: ["$Oct 2025", 0] },
        "Nov 2025": { $ifNull: ["$Nov 2025", 0] },
        "Dic 2025": { $ifNull: ["$Dic 2025", 0] },
        "Ene 2026": { $ifNull: ["$Ene 2026", 0] },
      },
    },

    // 8) Orden
    { $sort: { nombreFarmacia: 1, nombreProducto: 1 } },
  ];

  const rows = await Venta.aggregate(pipeline).allowDiskUse(true);
  console.log("Filas:", rows.length);

  console.log("Generando Excel...");

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ventas x Mes", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = [
    { header: "Nombre Farmacia", key: "nombreFarmacia", width: 28 },
    { header: "Nombre del producto", key: "nombreProducto", width: 40 },
    { header: "Código de barras", key: "codigoBarras", width: 18 },
    { header: "Categoría", key: "categoria", width: 20 },
    { header: "Ago 2025", key: "Ago 2025", width: 12 },
    { header: "Sep 2025", key: "Sep 2025", width: 12 },
    { header: "Oct 2025", key: "Oct 2025", width: 12 },
    { header: "Nov 2025", key: "Nov 2025", width: 12 },
    { header: "Dic 2025", key: "Dic 2025", width: 12 },
    { header: "Ene 2026", key: "Ene 2026", width: 12 },
  ];

  // Estilo header
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

  // Agrega filas
  for (const r of rows) ws.addRow(r);

  // Formato numérico para meses
  const monthCols = ["E", "F", "G", "H", "I", "J"];
  for (const col of monthCols) {
    ws.getColumn(col).numFmt = "0";
    ws.getColumn(col).alignment = { horizontal: "right" };
  }

  // Guardar archivo
  const outDir = path.join(__dirname, "..", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const outPath = path.join(outDir, "reporte_ventas_ago2025_ene2026.xlsx");
  await wb.xlsx.writeFile(outPath);

  console.log("✅ Listo:", outPath);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("ERROR:", err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
