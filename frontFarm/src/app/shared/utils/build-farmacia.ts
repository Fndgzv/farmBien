export function isEdge(): boolean {
  try { return /Edg\//.test(navigator.userAgent); } catch { return false; }
}

export function assetsBase(): string {
  try { return window.location.origin.replace(/\/+$/, ''); } catch { return ''; }
}

export function resolveLogoForPrint(img?: string): string {
  const base = assetsBase();
  if (!img || !String(img).trim()) return `${base}/assets/images/farmBienIcon.png`;

  const s = String(img);
  if (/^(data:|blob:)/i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return `${base}${s}`;
  if (s.startsWith('assets/')) return `${base}/${s}`;
  if (s.startsWith('browser/assets/')) return `${base}/${s.replace(/^browser\//,'')}`;
  return `${base}/assets/images/${s}`;
}

export async function logoToDataUrlSafe(src: string, timeoutMs = 2000): Promise<string> {
  try {
    if (!src || src.startsWith('data:')) return src;
    await new Promise<void>(res => {
      const img = new Image();
      (img as any).crossOrigin = 'anonymous';
      const to = setTimeout(res, timeoutMs);
      img.onload = () => { clearTimeout(to); res(); };
      img.onerror = () => { clearTimeout(to); res(); };
      img.src = src;
    });
    return await new Promise<string>(res => {
      const img = new Image();
      (img as any).crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || 64; c.height = img.naturalHeight || 64;
          c.getContext('2d')!.drawImage(img, 0, 0);
          res(c.toDataURL('image/png'));
        } catch { res(src); }
      };
      img.onerror = () => res(src);
      img.src = src;
    });
  } catch { return src; }
}

export async function buildFarmaciaForTicket(raw: {
  nombre?: string; direccion?: string; telefono?: string;
  titulo1?: string; titulo2?: string; imagen?: string;
}) {
  const abs = resolveLogoForPrint(raw.imagen);
  let imagen = abs;
  if (!isEdge()) {
    try { imagen = await logoToDataUrlSafe(abs); } catch { imagen = abs; }
  }
  // cache-buster para evitar caché “vieja”
  if (!imagen.startsWith('data:')) {
    imagen = `${imagen}${imagen.includes('?') ? '&' : '?'}v=${Date.now()}`;
  }
  return {
    nombre: raw.nombre ?? '',
    direccion: raw.direccion ?? '',
    telefono: raw.telefono ?? '',
    titulo1: raw.titulo1 ?? '',
    titulo2: raw.titulo2 ?? '',
    imagen
  };
}
