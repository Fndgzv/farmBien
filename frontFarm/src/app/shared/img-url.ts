// shared/img-url.ts
import { environment } from '../../environments/environment';

export function buildImgUrl(src?: string | null): string {
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src; // ya absoluta
  const base = environment.apiUrl.replace(/\/api\/?$/, ''); // https://farmbien.onrender.com
  return `${base}/uploads/${src}`; // src es "productos/xxx.jpg"
}
