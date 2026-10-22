/* Copia completa Naucalpan -> Nicolas Romero.
 * Simular: node scripts/copiar-inventario-nicolas-romero.js
 * Aplicar: node scripts/copiar-inventario-nicolas-romero.js --commit
 * Requiere destino vacío; si ya es idéntico, no realiza cambios.
 */
const path = require('path');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { ObjectId } = mongoose.mongo;
const origen = new ObjectId('6901b8db573b04d722ea9963');
const destino = new ObjectId('6ad8468833a97eb76fffc991');
const commit = process.argv.includes('--commit');

function contenido(documentos) {
  return documentos.map(({ _id, farmacia, ...datos }) => datos)
    .sort((a, b) => String(a.producto).localeCompare(String(b.producto)));
}

async function copiar(session) {
  const db = mongoose.connection.db;
  const opciones = session ? { session } : {};
  const farmacias = db.collection('farmacias');
  const inventarios = db.collection('inventariofarmacias');
  const farmaciaOrigen = await farmacias.findOne({ _id: origen }, { ...opciones, projection: { nombre: 1 } });
  const farmaciaDestino = await farmacias.findOne({ _id: destino }, { ...opciones, projection: { nombre: 1 } });
  const normalizar = nombre => String(nombre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  assert.equal(normalizar(farmaciaOrigen?.nombre), 'naucalpan', 'El ID origen no corresponde a Naucalpan.');
  assert.equal(normalizar(farmaciaDestino?.nombre), 'nicolas romero', 'El ID destino no corresponde a Nicolas Romero.');

  const fuente = await inventarios.find({ farmacia: origen }, opciones).toArray();
  const actuales = await inventarios.find({ farmacia: destino }, opciones).toArray();
  console.log(`Base: ${db.databaseName}. Naucalpan: ${fuente.length} registros. Nicolas Romero: ${actuales.length} registros.`);
  assert.ok(fuente.length > 0, 'El inventario origen está vacío; se cancela.');
  assert.ok(fuente.every(d => d.producto instanceof ObjectId), 'Hay registros sin producto válido; se cancela.');
  assert.equal(new Set(fuente.map(d => String(d.producto))).size, fuente.length, 'Hay productos duplicados en origen; se cancela para revisión.');

  if (actuales.length > 0) {
    assert.deepStrictEqual(contenido(actuales), contenido(fuente),
      'Nicolas Romero ya tiene inventario diferente. No se sobrescribe; requiere revisión.');
    console.log('El destino ya es una copia exacta. No se necesitan cambios.');
    return;
  }
  if (!commit) {
    console.log('Simulación correcta: se copiarán todos los campos, incluidas fechas, precios, existencias, stocks y promociones. Aplicar con --commit.');
    return;
  }
  assert.ok(session?.inTransaction(), 'La copia requiere una transacción.');
  const copias = fuente.map(doc => ({ ...doc, _id: new ObjectId(), farmacia: destino }));
  for (let i = 0; i < copias.length; i += 500) {
    await inventarios.insertMany(copias.slice(i, i + 500), opciones);
  }
  const resultado = await inventarios.find({ farmacia: destino }, opciones).toArray();
  assert.deepStrictEqual(contenido(resultado), contenido(fuente), 'La copia no coincide con el origen.');
  console.log(`Verificados ${resultado.length} registros: todos los campos coinciden con la lectura de Naucalpan en la transacción.`);
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  assert.ok(uri, 'Falta MONGODB_URI o MONGO_URI en backBien/.env.');
  // Incluye un límite para la resolución DNS, que puede exceder el timeout del driver.
  const limiteConexion = setTimeout(() => {
    console.error('No se pudo conectar a MongoDB en 30 segundos. No se modificó ningún dato.');
    process.exit(1);
  }, 30000);
  try {
    await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 15000 });
  } finally {
    clearTimeout(limiteConexion);
  }
  if (!commit) return copiar();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => copiar(session), {
      readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
    console.log('Transacción confirmada. Copia finalizada.');
  } finally {
    await session.endSession();
  }
}

if (require.main === module) {
  main().catch(error => {
    // Evitar mostrar credenciales o URI de conexión en los errores.
    console.error(`Error: ${String(error.message).replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[conexión MongoDB]')}`);
    process.exitCode = 1;
  }).finally(() => mongoose.disconnect());
}

module.exports = { contenido };
