/* const mongoose = require('mongoose');
require('dotenv').config();

const conectarDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log("✅ Conectado a MongoDB");
    } catch (error) {
        console.error("❌ Error conectando a MongoDB:", error);
        process.exit(1);
    }
};

module.exports = conectarDB; */

const mongoose = require('mongoose');
require('dotenv').config();

const conectarDB = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

        console.log("Intentando conectar a MongoDB con URI:", uri ? "✅ Detectada" : "❌ No encontrada");

        await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log("✅ Conectado a MongoDB");
    } catch (error) {
        console.error("❌ Error conectando a MongoDB:", error);
        process.exit(1);
    }
};

module.exports = conectarDB;

