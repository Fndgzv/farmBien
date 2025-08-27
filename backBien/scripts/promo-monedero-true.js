// backBien/scripts/promo-monedero-true.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://127.0.0.1:27017/farmaciaDB';

const DB_NAME = (() => {
  try {
    const pathname = new URL(MONGODB_URI).pathname;
    const db = pathname?.replace('/', '') || 'farmaciaDB';
    return db || 'farmaciaDB';
  } catch {
    return 'farmaciaDB';
  }
})();

const COLECCION = 'productos';

// Campos de promos a revisar
const PROMO_PATHS = [
  'promoLunes',
  'promoMartes',
  'promoMiercoles',
  'promoJueves',
  'promoViernes',
  'promoSabado',
  'promoDomingo',
  'promoDeTemporada',
];

// Categorías excluidas (monedero = false)
const EXCLUIDAS = ['Recargas', 'Servicio Médico'];

function buildExistsOr() {
  // $or que verifica que exista al menos uno de los subdocs de promo
  return PROMO_PATHS.map(p => ({ [p]: { $exists: true, $type: 'object' } }));
}

function buildSet(monederoValue) {
  // $set para monedero en todos los subcampos de promo.*.monedero
  const set = {};
  for (const p of PROMO_PATHS) {
    set[`${p}.monedero`] = monederoValue;
  }
  return set;
}

(async () => {
  console.log('Conectando a MongoDB:', MONGODB_URI);
  const client = new MongoClient(MONGODB_URI, { ignoreUndefined: true });
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const col = db.collection(COLECCION);
    console.log('✅ Conectado. DB:', DB_NAME);

    // Diagnóstico rápido
    const total = await col.estimatedDocumentCount();
    const conteos = {};
    for (const p of PROMO_PATHS) {
      conteos[p] = await col.countDocuments({ [p]: { $exists: true, $type: 'object' } });
    }
    console.log('🔎 Conteos de promos existentes:');
    console.log('🗃️  Total documentos en \'productos\':', total);
    for (const p of PROMO_PATHS) console.log(`   • Con ${p}: ${conteos[p]}`);

    // Filtros base
    const filtroTieneAlgunaPromo = { $or: buildExistsOr() };

    // 1) Categorías INCLUIDAS -> monedero = true
    // (todas menos las EXCLUIDAS)
    console.log('\n🛠️  Actualizando categorías INCLUIDAS (monedero=true)…');
    const filtroIncluidas = {
      ...filtroTieneAlgunaPromo,
      $or: [
        { categoria: { $exists: false } }, // por si hay productos sin categoría
        { categoria: { $nin: EXCLUIDAS } },
      ],
    };
    let totalIncluidasMod = 0;
    let totalIncluidasMatch = 0;
    for (const p of PROMO_PATHS) {
      const filtro = {
        ...filtroIncluidas,
        [p]: { $exists: true, $type: 'object' },
      };
      const set = { $set: { [`${p}.monedero`]: true } };
      const res = await col.updateMany(filtro, set);
      totalIncluidasMatch += res.matchedCount;
      totalIncluidasMod += res.modifiedCount;
      console.log(`   ▶ ${p}.monedero = true  | matched: ${res.matchedCount}, modified: ${res.modifiedCount}`);
    }

    // 2) Categorías EXCLUIDAS -> monedero = false
    console.log('\n🛠️  Actualizando categorías EXCLUIDAS (monedero=false)…');
    const filtroExcluidas = {
      ...filtroTieneAlgunaPromo,
      categoria: { $in: EXCLUIDAS },
    };
    let totalExcluidasMod = 0;
    let totalExcluidasMatch = 0;
    for (const p of PROMO_PATHS) {
      const filtro = {
        ...filtroExcluidas,
        [p]: { $exists: true, $type: 'object' },
      };
      const set = { $set: { [`${p}.monedero`]: false } };
      const res = await col.updateMany(filtro, set);
      totalExcluidasMatch += res.matchedCount;
      totalExcluidasMod += res.modifiedCount;
      console.log(`   ▶ ${p}.monedero = false | matched: ${res.matchedCount}, modified: ${res.modifiedCount}`);
    }

    console.log('\n-----------------------------------------------------');
    console.log(`✅ Incluidas (true): ${totalIncluidasMod} documentos modificados (matched: ${totalIncluidasMatch})`);
    console.log(`✅ Excluidas (false): ${totalExcluidasMod} documentos modificados (matched: ${totalExcluidasMatch})`);
    console.log('⏹️  Listo.');
  } catch (e) {
    console.error('❌ Error:', e);
  } finally {
    await client.close();
  }
})();
