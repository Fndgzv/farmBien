// copy-dist.js
const fs = require('fs-extra');
const path = require('path');

const source = path.join(__dirname, 'frontFarm', 'dist', 'front-farm');
const destination = path.join(__dirname, 'backBien', 'public');

console.log(`Copiando archivos de ${source} a ${destination} ...`);

fs.removeSync(destination); // Limpia destino
fs.copySync(source, destination);

console.log('✅ Archivos copiados correctamente.');
