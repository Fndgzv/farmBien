// src/app/utils/csv.ts
export type Column<T> = { key: keyof T | string; label: string; map?: (row: T) => any };

export function toCSV<T>(rows: T[], cols: Column<T>[], opts?: { separator?: string; bom?: boolean }): string {
  const sep = opts?.separator ?? ';';
  const esc = (v: any) => {
    if (v === null || v === undefined) return '';
    let s = String(v).replace(/\r?\n/g, ' ');
    if (s.includes('"')) s = s.replace(/"/g, '""');
    if (s.includes(sep) || s.includes('"')) s = `"${s}"`;
    return s;
  };
  const header = cols.map(c => esc(c.label)).join(sep);
  const body = rows.map(r => cols.map(c => esc(c.map ? c.map(r) : (r as any)[c.key as any])).join(sep)).join('\n');
  const csv = [header, body].join('\n');
  return opts?.bom === false ? csv : '\uFEFF' + csv;
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
