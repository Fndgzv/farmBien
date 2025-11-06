// utils/imagenes.js
function toRelativeImage(p) {
  if (!p) return p;
  return String(p)
    .replace(/^https?:\/\/[^/]+\/uploads\//i, '') // quita dominio + /uploads/
    .replace(/^uploads\//i, '');                  // quita 'uploads/' si quedó
}
module.exports = { toRelativeImage };
