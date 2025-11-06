import { environment } from '../../environments/environment';

export function buildImgUrl(img?: string): string {
  if (!img) return 'assets/images/farmBienIcon.png';

  // base: usa assetsBase si existe; si no, deriva de apiUrl quitando /api
  const base = (environment as any).assetsBase
    || environment.apiUrl.replace(/\/api\/?$/, '');

  // normaliza la ruta guardada en BD: puede venir "productos/xxx" o "uploads/xxx"
  const clean = String(img).replace(/^\/+/, ''); // quita / iniciales
  const rel = clean.startsWith('uploads/')
    ? clean
    : `uploads/${clean}`; // ← esto hace que "productos/xxx" se vuelva "uploads/productos/xxx"

  return `${base}/${rel}`;
}
