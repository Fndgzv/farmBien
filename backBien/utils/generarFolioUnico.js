function generarFolioBase({ prefijo = 'FB', incluirDia = true }) {
  const fecha = new Date();
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');

  const fechaStr = incluirDia ? `${year}${month}${day}` : `${year}${month}`;

  const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let cadenaAleatoria = '';
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * caracteres.length);
    cadenaAleatoria += caracteres[randomIndex];
  }

  return `${prefijo}${fechaStr}-${cadenaAleatoria}`;
}

async function generarFolioUnico(Modelo, opciones = {}) {
  let folio;
  do {
    folio = generarFolioBase(opciones);
  } while (await Modelo.exists({ folio }));
  return folio;
}

module.exports = generarFolioUnico;
