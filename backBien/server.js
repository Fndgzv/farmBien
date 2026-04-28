// =============================================================
// 🌟 SERVER.JS — Farmacias del Bienestar
// Ordenado, sin dependencias circulares, modelos cargados antes
// de todo, hooks después de modelos, rutas al final.
// =============================================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const conectarDB = require('./config/db');
const { isEnabled: isSessionSecurityEnabled } = require('./utils/sessionSecurity');

const app = express();

// =============================================================
// 🔧 MIDDLEWARES BASE
// =============================================================
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// =============================================================
// 🔌 CONEXIÓN A MONGODB
// =============================================================
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
console.log('Intentando conectar a MongoDB:', uri ? '✅ OK' : '❌ NO DEFINIDA');
console.log(
  `[SESSION_SECURITY] enabled=${isSessionSecurityEnabled()} raw="${String(process.env.SESSION_SECURITY_ENABLED || '') || '(undefined)'}"`
);
conectarDB();


// =============================================================
// 📌 REGISTRO DE MODELOS — ORDEN OBLIGATORIO
// =============================================================
require('./models/Usuario');
require('./models/Farmacia');

const Producto = require('./models/Producto'); // ← IMPORTAR AQUÍ
const InventarioFisico = require('./models/InventarioFisico'); // ← NECESARIO TAMBIÉN

require('./models/InventarioFarmacia');
require('./models/Venta');
require('./models/Pedido');
require('./models/Devolucion');
require('./models/Cancelacion');
require('./models/Cliente');
require('./models/Compra');
require('./models/CorteCaja');
require('./models/FichaConsultorio');
require('./models/Paciente');
require('./models/Receta');
require('./models/PantallaTurnosConfig');
require('./models/TurnoConsultorioCounter');

// =============================================================
// 📌 HOOKS (SIEMPRE DESPUÉS DE REGISTRAR LOS MODELOS INVOLUCRADOS)
// =============================================================
require('./models/hooks/producto-inventarioFisico.hook')(Producto.schema);


// =============================================================
// 🏥 HEALTHCHECK
// =============================================================
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection?.readyState;
  res.json({
    ok: true,
    db: dbState === 1 ? 'connected' : 'disconnected',
    env: process.env.NODE_ENV || 'unknown'
  });
});


// =============================================================
// 🛣 RUTAS PRINCIPALES
// =============================================================
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/usuarios', require('./routes/usuarioRoutes'));
app.use('/api/productos', require('./routes/productoRoutes'));
app.use('/api/farmacias', require('./routes/farmaciaRoutes'));
app.use('/api/proveedores', require('./routes/proveedorRoutes'));
app.use('/api/cortes', require('./routes/corteCajaRoutes'));
app.use('/api/surtirFarmacias', require('./routes/surtidoFarmaciaRoutes'));
app.use('/api/compras', require('./routes/compraRoutes'));
app.use('/api/inventario-farmacia', require('./routes/ajusteInventarioRoutes'));
app.use('/api', require('./routes/api')); // ventas, devoluciones, pedidos
app.use('/api/clientes', require('./routes/clientesRoutes'));
app.use('/api/label-designs', require('./routes/labelDesigns.routes'));
app.use('/api/labels', require('./routes/labels.products.routes'));
app.use('/api/inventario-portatil', require('./routes/inventario-portatil.routes'));
app.use('/api/reportes', require('./routes/reportesRoutes'));
app.use('/api/reportes', require('./routes/reportesPresupuestoRoutes'));
app.use('/api/inventario-fisico', require('./routes/inventarioFisico.routes'));
app.use("/api/fichas-consultorio", require("./routes/fichasConsultorio.routes"));
app.use("/api/pacientes", require("./routes/pacientes.routes"));
app.use("/api/recetas", require("./routes/recetas.routes"));
app.use("/api/pantalla-turnos", require("./routes/pantallaTurnos.routes"));

// =============================================================
// 📁 SERVIR ARCHIVOS UPLOADS
// =============================================================
const uploadsPath =
  process.env.UPLOADS_DIR && fs.existsSync(process.env.UPLOADS_DIR)
    ? process.env.UPLOADS_DIR
    : path.join(__dirname, 'uploads');

try { fs.mkdirSync(uploadsPath, { recursive: true }); } catch {}

app.use('/uploads', express.static(uploadsPath, {
  maxAge: '7d',
  etag: true,
}));


// =============================================================
// 🧱 SERVIR ANGULAR (SPA)
// =============================================================
const candidates = [
  path.join(__dirname, 'public', 'browser'),
  path.join(__dirname, 'public')
];

const angularPath = candidates.find(p => fs.existsSync(path.join(p, 'index.html'))) || null;

const serveSpaEnv = String(process.env.SERVE_SPA || 'auto').toLowerCase();
const SERVE_SPA = serveSpaEnv === 'true' || (serveSpaEnv === 'auto' && !!angularPath);

console.log('SERVE_SPA =', SERVE_SPA, 'Path:', angularPath || '(no build)');

if (SERVE_SPA && angularPath) {
  app.use(express.static(angularPath, {
    etag: true,
    maxAge: '1y',
    setHeaders: (res, filePath) => {
      if (!filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));

  app.get(['/ngsw.json','/ngsw-worker.js','/safety-worker.js','/worker-basic.min.js'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.sendFile(path.join(angularPath, req.path.replace(/^\//,'')));
  });

  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.removeHeader('ETag');
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.sendFile(path.join(angularPath, 'index.html'));
  });

} else {
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
    res.status(404).send('Frontend no desplegado en este servicio.');
  });
}


// =============================================================
// ⚠️ MANEJO GLOBAL DE ERRORES
// =============================================================
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    mensaje: err.message || 'Error en el servidor'
  });
});


// =============================================================
// 🚀 ARRANQUE DEL SERVIDOR
// =============================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});


// =============================================================
// 🧩 SINCRONIZAR ÍNDICES AL ARRANCAR
// =============================================================
mongoose.connection.once('open', async () => {
  try {
    const Venta = mongoose.model('Venta');
    const Producto = mongoose.model('Producto');
    const Pedido = mongoose.model('Pedido');
    const Devolucion = mongoose.model('Devolucion');
    const Cancelacion = mongoose.model('Cancelacion');
    const Cliente = mongoose.model('Cliente');
    const Compra = mongoose.model('Compra');
    const InventarioFarmacia = mongoose.model('InventarioFarmacia');
    const CorteCaja = mongoose.model('CorteCaja');
    const Paciente = mongoose.model('Paciente');
    const FichaConsultorio = mongoose.model('FichaConsultorio');
    const PantallaTurnosConfig = mongoose.model('PantallaTurnosConfig');
    const TurnoConsultorioCounter = mongoose.model('TurnoConsultorioCounter');

    await Promise.all([
      Venta.syncIndexes(),
      Producto.syncIndexes(),
      Pedido.syncIndexes(),
      Devolucion.syncIndexes(),
      Cancelacion.syncIndexes(),
      Cliente.syncIndexes(),
      Compra.syncIndexes(),
      InventarioFarmacia.syncIndexes(),
      CorteCaja.syncIndexes(),
      Paciente.syncIndexes(),
      FichaConsultorio.syncIndexes(),
      PantallaTurnosConfig.syncIndexes(),
      TurnoConsultorioCounter.syncIndexes(),
    ]);

    console.log('✅ Índices sincronizados correctamente');
  } catch (err) {
    console.error('❌ Error sincronizando índices:', err);
  }
});
