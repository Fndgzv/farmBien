const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, 'frontFarm', 'dist', 'front-farm');
const dest = path.join(__dirname, 'backBien', 'public');

function copyRecursive(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });

  fs.readdirSync(src).forEach(file => {
    const srcPath = path.join(src, file);
    const dstPath = path.join(dst, file);

    if (fs.lstatSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  });
}

copyRecursive(source, dest);
console.log(`✅ Copia de ${source} a ${dest} completada`);
