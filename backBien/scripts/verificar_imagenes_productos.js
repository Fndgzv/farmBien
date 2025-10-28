// backBien/scripts/verificar_imagenes_productos.js
require('dotenv').config();
const path = require('path');
const fs = require('fs/promises');
const mongoose = require('mongoose');
const Producto = require('../models/Producto');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function norm(p) {
  return String(p || '').replace(/^[\\/]+/, '').replace(/\\/g, '/');
}
async function exists(abs) {
  try { await fs.access(abs); return true; } catch { return false; }
}
async function resolveAbs(dbPath) {
  const n = norm(dbPath);
  if (!n) return null;
  const base = path.basename(n);
  const c1 = path.join(UPLOADS_DIR, base);
  if (await exists(c1)) return c1;
  const c2 = path.resolve(__dirname, '..', n);
  if (await exists(c2)) return c2;
  const c3 = path.join(UPLOADS_DIR, n);
  if (await exists(c3)) return c3;
  return null;
}

(async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) { console.error('Falta MONGO_URI'); process.exit(1); }
  await mongoose.connect(uri);

  const prods = await Producto.find({}, { nombre: 1, imagen: 1 }).lean();
  let ok = 0, missing = 0, undef = 0;

  for (const p of prods) {
    if (!p.imagen) { undef++; continue; }
    const abs = await resolveAbs(p.imagen);
    if (abs) ok++; else missing++;
  }

  console.log('=== RESUMEN ===');
  console.log('Total:', prods.length);
  console.log('Con imagen OK:', ok);
  console.log('Con imagen MISSING (archivo no existe):', missing);
  console.log('Sin imagen (undefined/null):', undef);

  // Opcional: lista detallada de los que faltan
  if (missing) {
    console.log('\nFALTANTES:');
    for (const p of prods) {
      if (!p.imagen) continue;
      const abs = await resolveAbs(p.imagen);
      if (!abs) console.log(`${p._id} | ${p.imagen} | ${p.nombre}`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
})();
