require('dotenv').config();
const express = require('express');
const conectarDB = require('./config/db');
const cors = require('cors');
const path = require('path');
const apiRoutes = require("./routes/api");

const app = express();

app.use(express.json());
app.use(cors());

// Conectar a la base de datos
console.log("Intentando conectar a MongoDB con URI:", process.env.MONGODB_URI ? "✅ Detectada" : "❌ No detectada");
conectarDB();

// Archivos estáticos para uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ----------------- RUTAS API -----------------
app.use('/api/usuarios', require('./routes/usuarioRoutes'));
app.use('/api/productos', require('./routes/productoRoutes'));
app.use('/api/farmacias', require('./routes/farmaciaRoutes'));
app.use('/api/proveedores', require('./routes/proveedorRoutes'));
app.use('/api/cortes', require('./routes/corteCajaRoutes'));
app.use('/api/surtirFarmacias', require('./routes/surtidoFarmaciaRoutes'));
app.use('/api/compras', require('./routes/compraRoutes'));
app.use('/api/inventario-farmacia', require('./routes/ajusteInventarioRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api', apiRoutes);

// ----------------- SERVIR ANGULAR -----------------
const angularPath = path.join(__dirname, 'public');
console.log("Sirviendo Angular desde:", angularPath);

app.use(express.static(angularPath));

// Fallback: cualquier ruta que no sea API sirve Angular
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(angularPath, 'index.html'));
  } else {
    res.status(404).json({ mensaje: 'API Not Found' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
