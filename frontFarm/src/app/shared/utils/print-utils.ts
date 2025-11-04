// src/app/shared/print-utils.ts

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

                console.log('PRINT DEBUG → listo?', !!el, el?.offsetWidth, el?.offsetHeight, el?.innerText?.slice(0, 120));


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

export async function logoToDataUrlSafe(src: string, timeoutMs = 2500): Promise<string> {
    try {
        if (!src || src.startsWith('data:')) return src;

        // precarga
        await preloadImage(src, timeoutMs);

        // dibuja en canvas -> dataURL
        return await new Promise<string>((res) => {
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
        });
    } catch {
        return src;
    }
}



