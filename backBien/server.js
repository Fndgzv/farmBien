require('dotenv').config();
const express = require('express');
const conectarDB = require('./config/db');
const cors = require('cors');
const path = require('path');
const apiRoutes = require("./routes/api");

const app = express(); // 👈 Aquí debe inicializarse antes de usarlo

app.use(express.json());
app.use(cors());

// Configuración para servir archivos estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Conectar a la base de datos
conectarDB();

// Importar rutas
app.use('/api/usuarios', require('./routes/usuarioRoutes'));
app.use('/api/productos', require('./routes/productoRoutes'));
app.use('/api/farmacias', require('./routes/farmaciaRoutes'));
app.use('/api/proveedores', require('./routes/proveedorRoutes'));
app.use('/api/cortes', require('./routes/corteCajaRoutes'));
app.use('/api/surtirFarmacias', require('./routes/surtidoFarmaciaRoutes'));
app.use('/api/compras', require('./routes/compraRoutes'));
app.use('/api/inventario-farmacia', require('./routes/ajusteInventarioRoutes'));

app.use('/api/auth', require('./routes/authRoutes'));

app.use("/api", apiRoutes);

const PORT = process.env.PORT || 5000;
app.get("/", (req, res) => {
    res.send("API del punto de venta de farmacia funcionando");
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
