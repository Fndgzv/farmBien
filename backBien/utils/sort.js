// backBien/utils/sort.js
function parseSortTop(orden = 'importe', dir = 'desc', {
  allowed = ['importe'],
  aliases = {},
  fallback = 'importe'
} = {}) {
  const o = String(orden).toLowerCase();
  const key = aliases[o] || (allowed.includes(o) ? o : fallback);
  const sentido = (String(dir).toLowerCase() === 'asc') ? 1 : -1;
  return { [key]: sentido, _id: 1 };
}

module.exports = { parseSortTop };
