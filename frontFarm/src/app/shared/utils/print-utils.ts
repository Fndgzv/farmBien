// src/app/shared/print-utils.ts

export async function buildFarmaciaForTicket(ctx: {
  farmaciaNombre: string;
  farmaciaDireccion: string;
  farmaciaTelefono?: string;
  farmaciaTitulo1?: string;
  farmaciaTitulo2?: string;
  farmaciaImagen?: string;
}) {
  // URL absoluta mismo origen
  const abs = resolveLogoForPrint(ctx.farmaciaImagen);
  // “rompe caché” SIEMPRE (Chrome/Edge en print son caprichosos)
  const withBuster = abs + (abs.includes('?') ? '&' : '?') + 'v=' + Date.now();

  return {
    nombre: ctx.farmaciaNombre,
    direccion: ctx.farmaciaDireccion,
    telefono: ctx.farmaciaTelefono || '',
    titulo1: ctx.farmaciaTitulo1 || '',
    titulo2: ctx.farmaciaTitulo2 || '',
    imagen: withBuster,      // 👈 ESTA es la que ve <app-ticket-header>
  };
}


export async function whenDomStable(): Promise<void> {
  // 2 RAFs: garantiza que Angular terminó de pintar
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

export async function waitForTicket(selector: string, timeoutMs = 1500): Promise<HTMLElement> {
  const t0 = Date.now();
  for (; ;) {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el && el.offsetWidth > 0 && el.offsetHeight > 0) return el;
    if (Date.now() - t0 > timeoutMs) throw new Error(`Ticket "${selector}" no está listo`);
    await new Promise(r => setTimeout(r, 50));
  }
}

export async function printWithPreload(
  getLogoSrc: () => string,
  beforeShow?: () => void | Promise<void>,
  afterHide?: () => void,
  onAfterPrint?: () => void,
  container?: string | HTMLElement,
  watchdogMs = 9000
): Promise<void> {
  const logo = getLogoSrc?.() ?? '';
  try { await preloadImage(logo, 2500); } catch { }

  if (beforeShow) await beforeShow();
  await whenDomStable();

  // Espera a que el ticket exista y tenga tamaño
  try {
    if (container) {
      if (typeof container === 'string') {
        await waitForTicket(container, 1500);

        const el = typeof container === 'string'
          ? document.querySelector(container) as HTMLElement | null
          : container as HTMLElement | null;
      } else {
        await waitForElementReady(container, 1500);
      }
    }
  } catch {
    // si no está listo, igual intentamos imprimir; no bloqueamos
  }

  // Orquestación
  return new Promise<void>((resolve) => {
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      try { afterHide?.(); } finally {
        try { onAfterPrint?.(); } catch { }
      }
      window.removeEventListener('afterprint', onAfterPrintEvt);
      mq?.removeEventListener?.('change', onMQ);
      if (wd) clearTimeout(wd);
      resolve();
    };

    const onAfterPrintEvt = () => finish();
    const mq = typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia('print')
      : null;
    const onMQ = (e: MediaQueryListEvent) => { if (!e?.matches) finish(); };

    window.addEventListener('afterprint', onAfterPrintEvt);
    mq?.addEventListener?.('change', onMQ);

    // Fallback por si el evento no llega (drivers, mobiles, etc.)
    const wd = window.setTimeout(finish, watchdogMs);

    try { window.print(); } catch { finish(); }
  });
}

async function waitForElementReady(el: HTMLElement, timeoutMs = 1500): Promise<void> {
  const t0 = Date.now();
  return new Promise<void>((res, rej) => {
    const tick = () => {
      const ok = !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
      if (ok) return res();
      if (Date.now() - t0 >= timeoutMs) return rej(new Error('Timeout esperando elemento'));
      requestAnimationFrame(tick);
    };
    tick();
  });
}


export function getOrigin(): string {
  try {
    return (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
  } catch { return ''; }
}

export function resolveLogoForPrint(img?: string): string {
  const origin = getOrigin();
  if (!img || !img.trim()) return `${origin}/assets/images/farmBienIcon.png`;

  // Ya es absoluta o dataURL/blob
  if (/^(data:|blob:|https?:)/i.test(img)) return img;

  const clean = img.replace(/^\/+/, '');
  if (clean.startsWith('assets/')) return `${origin}/${clean}`;
  if (clean.startsWith('browser/assets/')) return `${origin}/${clean.replace(/^browser\//, '')}`;

  // Nombre suelto: asumimos assets/images/<nombre>
  return `${origin}/assets/images/${clean}`;
}

export function preloadImage(src: string, timeoutMs = 2500): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!src) return resolve();
    const img = new Image();
    if (/^https?:/i.test(src)) (img as any).crossOrigin = 'anonymous';
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const to = setTimeout(finish, timeoutMs);
    img.onload = () => { clearTimeout(to); finish(); };
    img.onerror = () => { clearTimeout(to); finish(); };
    img.src = src;
  });
}

export async function isolateAndPrint(
  el: HTMLElement,
  watchdogMs = 9000
): Promise<void> {
  // Portal a nivel <body> para evitar ancestros ocultos
  const portal = document.createElement('div');
  portal.id = '__print_portal__';
  portal.setAttribute('data-print', '1');
  // reset fuerte de estilos del portal
  (portal as any).style = `
    all: initial;
    position: fixed;
    inset: 0;
    background: #fff;
    z-index: 2147483647;
    display: block;
  `;

  // clonamos el ticket (HTML estático) y lo colocamos arriba-izquierda
  const clone = el.cloneNode(true) as HTMLElement;
  clone.id = 'ticketPedido'; // para que tus estilos de ticket apliquen
  clone.style.position = 'absolute';
  clone.style.left = '0';
  clone.style.top = '0';

  portal.appendChild(clone);
  document.body.appendChild(portal);
  await whenDomStable();

  // orquestación de impresión
  await new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try { document.body.removeChild(portal); } catch { }
      window.removeEventListener('afterprint', finish);
      mq?.removeEventListener?.('change', onMQ);
      if (wd) clearTimeout(wd);
      resolve();
    };
    const mq = 'matchMedia' in window ? window.matchMedia('print') : null;
    const onMQ = (e: MediaQueryListEvent) => { if (!e.matches) finish(); };
    window.addEventListener('afterprint', finish);
    mq?.addEventListener?.('change', onMQ);
    const wd = window.setTimeout(finish, watchdogMs);
    try { window.print(); } catch { finish(); }
  });
}

export async function isolateAndPrintOnce(srcEl: HTMLElement): Promise<void> {
  // 1) Ventana limpia
  const w = window.open('', '_blank', 'noopener,noreferrer,width=780,height=900');
  if (!w) throw new Error('No se pudo abrir la ventana de impresión');

  const doc = w.document;

  // 2) CSS mínimo (el tuyo de ticket) — NO dupliques HTML
  doc.open();
  doc.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>Imprimir</title>
        <style>
          /* Tu CSS global de ticket */
          @page { size: 80mm auto; margin: 0; }
          body { margin: 0; }
          .ticket-impresion { width: 276pt; margin-left: 8.5pt; }
          /* agrega aquí el resto de reglas que ya usas para tickets */
        </style>
      </head>
      <body>
        ${srcEl.outerHTML}  <!-- 👈 SE ESCRIBE UNA SOLA VEZ -->
      </body>
    </html>
  `);
  doc.close();

  // 3) Espera a que carguen las imágenes (logo) antes de imprimir
  await new Promise<void>(resolve => {
    const imgs = Array.from(doc.images);
    if (!imgs.length) return resolve();
    let pend = imgs.length;
    const done = () => (--pend <= 0) && resolve();
    imgs.forEach(img => {
      if (img.complete) return done();
      img.onload = done;
      img.onerror = done;
    });
    // “plan B” por si el onload no se dispara
    setTimeout(resolve, 1000);
  });

  // 4) Imprime UNA sola vez y cierra
  await new Promise<void>(resolve => {
    w.onafterprint = () => { try { w.close(); } catch { } resolve(); };
    // Chrome a veces necesita un tick para pintar
    setTimeout(() => w.print(), 50);
  });
}

// Fallback robusto: imprime un elemento en una ventana aislada y cierra.
export async function printElementOnce(el: HTMLElement) {
  if (!el) return;

  // Asegura que el HTML a imprimir ya existe
  const htmlTicket = el.outerHTML;

  // CSS mínimo para ticket (ajusta si usas otras medidas)
  const css = `
    @page { size: 80mm auto; margin: 0; }
    html, body { margin:0; padding:0; }
    .ticket-impresion { width: 276pt; margin-left: 8.5pt; }
  `;

  const docHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket</title>
  <style>${css}</style>
</head>
<body>${htmlTicket}</body>
</html>`;

  const w = window.open('', 'ticketWin', 'width=600,height=800,noopener,noreferrer');
  if (!w) { alert('Habilita los pop-ups para imprimir.'); return; }

  // Escribimos y esperamos onload
  w.document.open();
  w.document.write(docHtml);
  w.document.close();

  // Asegura un único disparo
  let fired = false;
  const doPrint = () => {
    if (fired) return;
    fired = true;
    try { w.focus(); } catch { }
    try { w.print(); } catch { }
    // Cierra después de un pequeño delay (Edge/Chrome)
    setTimeout(() => { try { w.close(); } catch { } }, 250);
  };

  // Cuando cargue el DOM, imprime
  w.onload = doPrint;
  // Fallback si onload no dispara por políticas del navegador
  setTimeout(doPrint, 700);
}

export async function logoToDataUrlSafe(src: string, timeoutMs = 2500): Promise<string> {
  try {
    if (!src || src.startsWith('data:')) return src || '';
    await new Promise<void>((resolve) => {
      const img = new Image();
      (img as any).crossOrigin = 'anonymous';
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
      setTimeout(resolve, timeoutMs);
    });
    return await new Promise<string>((res) => {
      try {
        const img = new Image();
        (img as any).crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth || 64;
            c.height = img.naturalHeight || 64;
            const ctx = c.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            res(c.toDataURL('image/png'));
          } catch { res(src); }
        };
        img.onerror = () => res(src);
        img.src = src;
      } catch { res(src); }
    });
  } catch { return src; }
}

// --- LOGO: traer como dataURL, si falla regresa el src tal cual
export async function toDataURL(src: string, timeoutMs = 2500): Promise<string> {
  if (!src || src.startsWith('data:')) return src || '';
  return new Promise<string>((resolve) => {
    const img = new Image();
    // mismo origen: OK; si algún día es CDN, manten esto
    (img as any).crossOrigin = 'anonymous';
    const t = setTimeout(() => resolve(src), timeoutMs);
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 64;
        c.height = img.naturalHeight || 64;
        c.getContext('2d')!.drawImage(img, 0, 0);
        clearTimeout(t);
        resolve(c.toDataURL('image/png'));
      } catch {
        clearTimeout(t);
        resolve(src);
      }
    };
    img.onerror = () => { clearTimeout(t); resolve(src); };
    img.src = src;
  });
}

// print-utils.ts
export async function printNodeInIframe(
  node: HTMLElement,
  opts?: {
    fallbackMs?: number;
    settleMs?: number;   // micro-respiro antes de print
    feedMm?: number;     // espacio extra al final del ticket (evita encimado)
  }
): Promise<void> {
  const fallbackMs = opts?.fallbackMs ?? 25000; // 👈 más alto (evita “resolver” antes de tiempo)
  const settleMs = opts?.settleMs ?? 120;
  const feedMm = opts?.feedMm ?? 10;            // 👈 ajusta 8–15mm según tu térmica

  const waitMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  return new Promise<void>((resolve, reject) => {
    let done = false;

    const finish = (iframe?: HTMLIFrameElement) => {
      if (done) return;
      done = true;
      try { if (iframe && document.body.contains(iframe)) document.body.removeChild(iframe); } catch { }
      resolve();
    };

    try {
      // 1) Crear iframe oculto
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const win = iframe.contentWindow;
      if (!win) throw new Error('No se pudo obtener contentWindow del iframe');
      const doc = win.document;

      // 2) Documento base
      doc.open();
      doc.write('<!doctype html><html><head></head><body></body></html>');
      doc.close();

      // 3) Copiar head (estilos globales, etc.)
      doc.head.innerHTML = document.head.innerHTML;

      // 4) Clonar el ticket
      const clone = node.cloneNode(true) as HTMLElement;
      doc.body.appendChild(clone);

      // 5) FEED al final (para separar trabajos y evitar encimado)
      const feed = doc.createElement('div');
      feed.style.height = `${feedMm}mm`;
      doc.body.appendChild(feed);

      const waitImages = async () => {
        const imgs = Array.from(doc.images);
        await Promise.all(imgs.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>(res => {
            img.onload = () => res();
            img.onerror = () => res();
          });
        }));
      };

      const waitFonts = async () => {
        const anyDoc = doc as any;
        if (anyDoc.fonts && typeof anyDoc.fonts.ready?.then === 'function') {
          try { await anyDoc.fonts.ready; } catch { }
        }
      };

      const waitTwoFrames = () =>
        new Promise<void>(r => win.requestAnimationFrame(() => win.requestAnimationFrame(() => r())));

      // 6) Hooks de finalización (más confiables)
      const mql = win.matchMedia?.('print');
      const onMQ = (e: MediaQueryListEvent) => { if (!e.matches) finish(iframe); };
      mql?.addEventListener?.('change', onMQ);

      // Fallback (solo si TODO falla)
      const fallbackTimer = window.setTimeout(() => finish(iframe), fallbackMs);

      (async () => {
        await waitImages();
        await waitFonts();
        await waitTwoFrames();
        await waitMs(settleMs);

        // IMPORTANTÍSIMO: setear onafterprint ANTES del print
        win.onafterprint = () => {
          window.clearTimeout(fallbackTimer);
          finish(iframe);
        };

        win.focus();
        win.print();
      })().catch(err => {
        window.clearTimeout(fallbackTimer);
        try { if (document.body.contains(iframe)) document.body.removeChild(iframe); } catch { }
        if (!done) { done = true; reject(err); }
      });
    } catch (e) {
      reject(e);
    }
  });
}

export async function printCopies(node: HTMLElement, copies = 2, opts?: {
  fallbackMs?: number;
  settleMs?: number;
  feedMm?: number;
  betweenMs?: number;  // pausa entre copias
}) {
  const betweenMs = opts?.betweenMs ?? 350;

  for (let k = 0; k < copies; k++) {
    await printNodeInIframe(node, opts);
    if (k < copies - 1) {
      await new Promise(r => setTimeout(r, betweenMs));
    }
  }
}
