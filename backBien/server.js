// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const conectarDB = require('./config/db');
const cors = require('cors');
const path = require('path');

const reportesRoutes = require('./routes/reportesRoutes');

const app = express();

// ---------- Middlewares base ----------
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------- Conexión DB (acepta ambos nombres de env) ----------
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
console.log('Intentando conectar a MongoDB con URI:', uri ? '✅ Detectada' : '❌ No detectada');
conectarDB(); // asegúrate que en config/db.js también haga el mismo fallback

// ---------- Healthcheck útil para Render ----------
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection?.readyState; // 1 = connected
  res.json({
    ok: true,
    db: dbState === 1 ? 'connected' : String(dbState ?? 'unknown'),
    env: process.env.NODE_ENV || 'unknown'
  });
});

// ---------- Rutas de API ----------
app.use('/api/usuarios', require('./routes/usuarioRoutes'));
app.use('/api/productos', require('./routes/productoRoutes'));
app.use('/api/farmacias', require('./routes/farmaciaRoutes'));
app.use('/api/proveedores', require('./routes/proveedorRoutes'));
app.use('/api/cortes', require('./routes/corteCajaRoutes'));
app.use('/api/surtirFarmacias', require('./routes/surtidoFarmaciaRoutes'));
app.use('/api/compras', require('./routes/compraRoutes'));
app.use('/api/inventario-farmacia', require('./routes/ajusteInventarioRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api', require('./routes/api')); // Rutas de: ventas, devoluciones, pedidos, clientes
app.use('/api/reportes', reportesRoutes);


// ---------- Archivos estáticos (uploads) ----------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- Servir Angular build ----------
const angularPath = path.join(__dirname, 'public', 'browser');
console.log('Sirviendo Angular desde:', angularPath);

// estáticos con cache largo (los archivos tienen hash en el nombre)
app.use(express.static(angularPath, { maxAge: '1y', etag: true }));

// fallback SPA: devolver index.html SIN cache para evitar frontend viejo
app.get('*', (req, res, next) => {
  // no interceptar rutas de API ni uploads
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(angularPath, 'index.html'));
});

// ---------- Manejador de errores ----------
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({ mensaje: err.message || 'Error en el servidor' });
});

// ---------- Arranque ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});


// ---------- Sincronizar índices (tras conectar a Mongo) ----------
const Venta = require('./models/Venta'); // importa el modelo DESPUÉS de conectarDB si tu modelo no necesita la conexión aún
const Producto = require('./models/Producto');
const Pedido = require('./models/Pedido');
const Devolucion = require('./models/Devolucion');
const Cancelacion = require('./models/Cancelacion');

mongoose.connection.once('open', async () => {
  try {
    // Si quieres, sincroniza más colecciones aquí (agrega otros modelos al Promise.all)
    await Promise.all([
      Venta.syncIndexes(),
      Devolucion.syncIndexes(),
      Pedido.syncIndexes(),
      Cancelacion.syncIndexes(),
    ]);
    console.log('✅ Índices sincronizados: Venta, Pedido, Devolución y Cancelación');
  } catch (e) {
    console.error('❌ Error al sincronizar índices:', e?.message || e);
  }
});
