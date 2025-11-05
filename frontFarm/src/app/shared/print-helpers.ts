// src/app/shared/print-helpers.ts
export function buildFarmaciaForTicket(ctx: {
  farmaciaNombre: string; farmaciaDireccion: string; farmaciaTelefono?: string;
  farmaciaTitulo1?: string; farmaciaTitulo2?: string; farmaciaImagen?: string;
}) {
  const base = typeof window !== 'undefined'
    ? window.location.origin.replace(/\/+$/,'')
    : '';

  const raw = String(ctx.farmaciaImagen ?? '').trim();
  let img = raw;

  // Normaliza a URL absoluta del mismo host
  if (!/^data:|^blob:|^https?:/i.test(img)) {
    if (!img) {
      img = `${base}/assets/images/farmBienIcon.png`;
    } else if (img.startsWith('/')) {
      img = `${base}${img}`;
    } else if (img.startsWith('assets/')) {
      img = `${base}/${img}`;
    } else {
      img = `${base}/assets/images/${img}`;
    }
  }

  // Cache-buster para Chrome/Edge (evita logo viejo o 404 caché)
/*   const sep = img.includes('?') ? '&' : '?';
  img = `${img}${sep}v=${Date.now()}`; */

  if (!/[?&]v=/.test(img)) {
    const sep = img.includes('?') ? '&' : '?';
    img = `${img}${sep}v=${Date.now()}`;
  }

  return {
    nombre:   ctx.farmaciaNombre ?? '',
    direccion:ctx.farmaciaDireccion ?? '',
    telefono: ctx.farmaciaTelefono ?? '',
    titulo1:  ctx.farmaciaTitulo1 ?? '',
    titulo2:  ctx.farmaciaTitulo2 ?? '',
    imagen:   img,
  };
}
