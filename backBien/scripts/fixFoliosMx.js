// backBien/scripts/fixFoliosMx.js
// Corrige el prefijo de fecha de los folios "FBYYYYMMDD-XXXXXX" usando fecha local CDMX

// USO:
//  node scripts/fixFoliosMx.js --dry
//  node scripts/fixFoliosMx.js --apply
//  node scripts/fixFoliosMx.js --apply --from 2025-08-01 --to 2025-09-30

const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env'), // carga backBien/.env
});
const mongoose = require('mongoose');
const { DateTime } = require('luxon');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[fixFoliosMx] ❌ No se encontró MONGO_URI/MONGODB_URI. Ponlo en .env o exporta la variable.');
  process.exit(1);
}

const ZONE = 'America/Mexico_City';

// Flags CLI
const args = process.argv.slice(2);
const DRY = args.includes('--dry') || !args.includes('--apply');
const fromArg = valOf('--from');
const toArg   = valOf('--to');

function valOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i+1] : null;
}

function yyyymmddCdmx(dateJs) {
  // dateJs es Date (UTC en Mongo), la convertimos a CDMX y formateamos
  return DateTime.fromJSDate(dateJs, { zone: 'utc' })
    .setZone(ZONE)
    .toFormat('yyyyLLdd');
}

function parseRange(from, to) {
  const q = {};
  if (from) {
    const dt = DateTime.fromISO(from, { zone: ZONE }).startOf('day').toUTC();
    if (dt.isValid) q.$gte = dt.toJSDate();
  }
  if (to) {
    const dt = DateTime.fromISO(to, { zone: ZONE }).plus({ days: 1 }).startOf('day').toUTC();
    if (dt.isValid) q.$lt = dt.toJSDate();
  }
  return Object.keys(q).length ? q : null;
}

async function run() {
  console.log(`[fixFoliosMx] Conectando a Mongo: ${MONGO_URI}`);
  await mongoose.connect(MONGO_URI);

  // Accede directo a la colección para evitar importar el modelo
  const col = mongoose.connection.collection('ventas');

  // Arma query base: sólo folios que empiecen con "FB" y tengan patrón fecha-sufijo
  const folioRegex = /^FB(\d{8})-([A-Za-z0-9]+)$/;

  const fechaRange = parseRange(fromArg, toArg);
  const query = {
    folio: { $regex: '^FB\\d{8}-' }
  };
  if (fechaRange) query.fecha = fechaRange;

  console.log(`[fixFoliosMx] DRY-RUN: ${DRY ? 'ON (no escribe)' : 'OFF (aplica cambios)'}`);
  if (fromArg || toArg) console.log(`[fixFoliosMx] Filtro rango local CDMX => from: ${fromArg || '-'} to: ${toArg || '-'}`);

  const cursor = col.find(query, { projection: { _id: 1, folio: 1, fecha: 1 } });

  let revisados = 0;
  let yaOk = 0;
  let porActualizar = 0;
  const ops = [];

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    revisados++;

    const { _id, folio, fecha } = doc;
    if (!fecha || !(fecha instanceof Date)) {
      // sin fecha válida: saltar
      continue;
    }
    const m = folioRegex.exec(String(folio));
    if (!m) {
      // folio no estándar FBYYYYMMDD-XXXX: saltar
      continue;
    }

    const [, fechaFolio, sufijo] = m;
    const ymdCdmx = yyyymmddCdmx(fecha);

    if (fechaFolio === ymdCdmx) {
      yaOk++;
      continue;
    }

    const nuevoFolio = `FB${ymdCdmx}-${sufijo}`;
    porActualizar++;

    if (!DRY) {
      ops.push({
        updateOne: {
          filter: { _id },
          update: { $set: { folio: nuevoFolio } }
        }
      });
      // Ejecuta en tandas para no cargar RAM
      if (ops.length >= 1000) {
        await col.bulkWrite(ops, { ordered: false });
        ops.length = 0;
      }
    }

    // Log ligero
    if (porActualizar <= 10) {
      console.log(`[fixFoliosMx] ${_id}  ${folio}  ->  ${nuevoFolio}`);
    }
  }

  if (!DRY && ops.length) {
    await col.bulkWrite(ops, { ordered: false });
  }

  console.log(`[fixFoliosMx] Revisados: ${revisados}`);
  console.log(`[fixFoliosMx] Correctos (ya OK): ${yaOk}`);
  console.log(`[fixFoliosMx] Cambiados${DRY ? ' (simulados)': ''}: ${porActualizar}`);

  await mongoose.disconnect();
  console.log('[fixFoliosMx] Listo.');
}

run().catch(e => {
  console.error('[fixFoliosMx][ERROR]', e);
  process.exit(1);
});
