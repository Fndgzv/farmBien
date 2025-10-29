require('dotenv').config(); 
const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');

// Usamos la URI del .env
const MONGO_URI = process.env.MONGO_URI;

const farmaciaId = '6901b8db573b04d722ea9963'; // reemplaza con un _id real

mongoose.connect(MONGO_URI)
  .then(async () => {
    const productos = await Producto.find();
    const inventario = productos.map(prod => ({
      producto: prod._id,
      farmacia: farmaciaId,
      existencia: 20,
      precioVenta: prod.precio
    }));

    await InventarioFarmacia.insertMany(inventario);
    console.log('✅ Inventario cargado correctamente.');
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('❌ Error al conectar o cargar:', err);
    mongoose.disconnect();
  });
