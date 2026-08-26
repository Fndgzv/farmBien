const PATRON_NOMBRE_SIN_INVENTARIO = '^(?:Pza|pza|PZA)';

function controlaInventario(producto) {
  return producto?.inventario !== false;
}

function esProductoSinInventarioInicial(producto) {
  return new RegExp(PATRON_NOMBRE_SIN_INVENTARIO).test(String(producto?.nombre ?? ''))
    || producto?.categoria === 'Servicio Médico';
}

function crearReglasSinInventario() {
  return [
    { nombre: { $regex: PATRON_NOMBRE_SIN_INVENTARIO } },
    { categoria: 'Servicio Médico' },
  ];
}

module.exports = {
  controlaInventario,
  esProductoSinInventarioInicial,
  crearReglasSinInventario,
};
