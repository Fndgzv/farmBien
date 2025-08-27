// scripts/inspeccionar-db.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/farmaciaDB';
(async () => {
  const client = new MongoClient(uri);
  await client.connect();
  const dbName = (new URL(uri).pathname.replace('/','')) || 'farmaciaDB';
  const db = client.db(dbName);

  console.log('DB:', db.databaseName);
  console.log('Colecciones:', (await db.listCollections().toArray()).map(c => c.name));

  const col = db.collection('productos');
  console.log('Count productos:', await col.countDocuments());
  console.log('Ejemplo doc:', await col.findOne({}, { projection: { _id:1, nombre:1, categoria:1, promoLunes:1 } }));

  await client.close();
})();
