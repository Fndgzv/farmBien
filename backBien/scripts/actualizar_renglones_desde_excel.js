// backBien/scripts/actualizar_renglones_desde_excel.js
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

// Ajusta la ruta si tu modelo está en otra carpeta:
const Producto = require('../models/Producto');

// ---- helpers cli ----
function getArg(name, def) {
  const withEq = process.argv.find(a => a.startsWith(`--${name}=`));
  if (withEq) return withEq.split('=').slice(1).join('=');
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1];
  }
  return def;
}

const file  = getArg('file');            // --file "C:\ruta\archivo.xlsx|csv"
const sheet = getArg('sheet', null);     // --sheet "NombreHoja" (opcional p/ XLSX)
const dry   = String(getArg('dry', 'false')).toLowerCase() === 'true';

if (!file) {
  console.error('❌ Falta --file "ruta.xlsx|.csv"');
  process.exit(1);
}

function normalizeBarcode(v) {
  if (v == null) return '';
  // Cadena sin espacios/commas; evita notación científica y conserva ceros:
  return String(v).trim().replace(/\s+/g, '').replace(/,/g, '');
}

(async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('Falta MONGO_URI en .env');
    await mongoose.connect(uri);

    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) throw new Error(`No existe el archivo: ${abs}`);

    // raw:false => convierte a string cuando puede (evita 7.50E+12)
    const wb = XLSX.readFile(abs, { raw: false });

    // Si no pasas sheet o no existe, toma la primera
    const sheetName = (sheet && wb.Sheets[sheet]) ? sheet : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error(`No se encontró la hoja "${sheetName}"`);

    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, blankrows: false });

    const ops = [];
    let vistos = 0, conCodigo = 0;

    for (const row of rows) {
      vistos++;

      // Acepta varios alias por si cambia el encabezado:
      const codigo = normalizeBarcode(
        row.codigoBarras ?? row.codigobarras ?? row.codigo ?? row.barcode ?? row.CodigoBarras ?? row.CODIGO
      );
      if (!codigo) continue;

      const renglon1 = String(row.Renglon1 ?? row.renglón1 ?? row.renglon_1 ?? '').trim();
      const renglon2 = String(row.Renglon2 ?? row.renglón2 ?? row.renglon_2 ?? '').trim();

      conCodigo++;
      ops.push({
        updateOne: {
          filter: { codigoBarras: codigo },
          update: { $set: { renglon1, renglon2 } },
        },
      });
    }

    console.log(`Filas leídas: ${vistos} | con código: ${conCodigo} | updates: ${ops.length}`);

    if (!ops.length) {
      console.log('No hay operaciones por ejecutar.');
      await mongoose.disconnect();
      return;
    }

    if (dry) {
      console.log('[DRY RUN] Primeras 5 operaciones:');
      console.dir(ops.slice(0, 5), { depth: null });
      await mongoose.disconnect();
      return;
    }

    const res = await Producto.bulkWrite(ops, { ordered: false });
    console.log('Resultado bulkWrite:', res.result || res);

    await mongoose.disconnect();
    console.log('Listo ✅');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
