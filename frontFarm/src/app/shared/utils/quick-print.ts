// src/app/shared/quick-print.ts
export function quickPrint(
  showTicket: () => void,
  hideTicket: () => void,
  after?: () => void
) {
  try {
    showTicket();                   // enciende *ngIf
    // 2 RAFs + micro-respiro => asegura layout y estilos aplicados
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          try { window.print(); }
          finally {
            hideTicket();           // apaga ticket
            after?.();              // guarda / API / etc.
          }
        }, 0);
      });
    });
  } catch {
    hideTicket();
    after?.();
  }
}
