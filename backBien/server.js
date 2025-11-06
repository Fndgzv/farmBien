// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const conectarDB = require('./config/db');
const cors = require('cors');
const path = require('path');
const fs       = require('fs');
const conectarDB = require('./config/db');
const reportesRoutes = require('./routes/reportesRoutes');
const clientesRoutes = require('./routes/api');

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
app.use('/api/reportes', reportesRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api', require('./routes/api')); // Rutas de: ventas, devoluciones, pedidos, clientes
app.use('/api/label-designs', require('./routes/labelDesigns.routes'));
app.use('/api/labels', require('./routes/labels.products.routes'));

app.use('/api/reportes', require('./routes/reportesPresupuestoRoutes'));

// ───────────────── Archivos estáticos: UPLOADS ─────────────────
// Usa disco persistente si está definido (Render Disk), si no, la carpeta local.
const uploadsPath =
  process.env.UPLOADS_DIR && fs.existsSync(process.env.UPLOADS_DIR)
    ? process.env.UPLOADS_DIR
    : path.join(__dirname, 'uploads');

console.log('Sirviendo /uploads desde:', uploadsPath);

app.use('/uploads', express.static(uploadsPath, {
  maxAge: '7d',
  etag: true,
}));

// Fallback de compatibilidad: /uploads/:file → intenta raíz y /productos
app.get('/uploads/:file', (req, res, next) => {
  const direct = path.join(uploadsPath, req.params.file.replace(/^uploads\//i, ''));
  if (fs.existsSync(direct)) return res.sendFile(direct);

  const inProductos = path.join(uploadsPath, 'productos', req.params.file);
  if (fs.existsSync(inProductos)) return res.sendFile(inProductos);

  return next(); // 404 normal si tampoco existe
});

// ───────────────── Servir Angular build (SPA) ─────────────────
// Preferimos backBien/public/browser (Angular moderno). Si no existe, caemos a backBien/public.
const browserPath = path.join(__dirname, 'public', 'browser');
const publicPath  = path.join(__dirname, 'public');
const angularPath = fs.existsSync(browserPath) ? browserPath : publicPath;

console.log('Sirviendo Angular desde:', angularPath);

// Assets con cache largo (inmutables); index.html sin cache lo servimos en el fallback
app.use(express.static(angularPath, {
  etag: true,
  maxAge: '1y',
  setHeaders: (res, filePath) => {
    if (!filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Service workers y similares sin cache agresivo
app.get(['/ngsw.json','/ngsw-worker.js','/safety-worker.js','/worker-basic.min.js'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.sendFile(path.join(angularPath, req.path.replace(/^\//,'')));
});

// SPA fallback: todo lo que no sea /api o /uploads va a index.html SIN cache
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.removeHeader('ETag');
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.sendFile(path.join(angularPath, 'index.html'));
});

// ───────────────── Manejador de errores ─────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({ mensaje: err.message || 'Error en el servidor' });
});

// ───────────────── Arranque ─────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});

// ───────────────── Sincronizar índices (tras conectar DB) ─────────────────
const Venta              = require('./models/Venta');
const Producto           = require('./models/Producto');
const Pedido             = require('./models/Pedido');
const Devolucion         = require('./models/Devolucion');
const Cancelacion        = require('./models/Cancelacion');
const Cliente            = require('./models/Cliente');
const Compra             = require('./models/Compra');
const InventarioFarmacia = require('./models/InventarioFarmacia');
const CorteCaja          = require('./models/CorteCaja');

mongoose.connection.once('open', async () => {
  try {
    await Promise.all([
      Venta.syncIndexes(),
      Producto.syncIndexes(),
      Devolucion.syncIndexes(),
      Pedido.syncIndexes(),
      Cancelacion.syncIndexes(),
      Cliente.syncIndexes(),
      Compra.syncIndexes(),
      InventarioFarmacia.syncIndexes(),
      CorteCaja.syncIndexes(),
    ]);
    console.log('✅ Índices sincronizados: Venta, Producto, InventarioFarmacia, Pedido, Devolución, Cancelación, Cliente, CorteCaja y Compra');
  } catch (e) {
    console.error('❌ Error al sincronizar índices:', e?.message || e);
  }
});