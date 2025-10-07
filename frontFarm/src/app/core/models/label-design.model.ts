// frontFarm/src/app/core/models/label-design.model.ts

export type LabelAlign = 'left' | 'center' | 'right';
export type LabelType = 'text' | 'price' | 'barcode';

export type LabelField =
  | 'nombre'
  | 'codigoBarras'
  | 'renglon1'
  | 'renglon2'
  | 'precioVenta'
  | 'custom';

export type LabelMode = 'sheet' | 'roll';
export interface LabelBarcodeOptions {
  symbology?: 'CODE128' | 'EAN13' | 'EAN8' | 'QR';
  width?: number;          // grosor de barra (px)
  height?: number;         // alto (px)
  displayValue?: boolean;  // mostrar texto bajo el código
}

export interface LabelElement {
  id?: string;

  type: LabelType;
  field?: 'nombre' | 'renglon1' | 'renglon2' | 'precioVenta' | 'codigoBarras';
  // posición/tamaño relativos (0–100)
  x: number; y: number; w: number; h: number;

  // estilo
  fontSize?: number;
  bold?: boolean;
  align?: LabelAlign;
  uppercase?: boolean;

  // adornos
  prefix?: string;
  suffix?: string;

  // texto literal (si field = 'custom')
  text?: string;

  // opciones de código de barras (solo type='barcode')
  barcode?: LabelBarcodeOptions;
}

export interface LabelDesign {
  _id?: string;
  nombre: string;

  // etiqueta (mm)
  size?: {
    widthMm: number;
    heightMm: number;
    marginMm: number;
  };

  layout?: {
    pageWidthMm: number;
    pageHeightMm: number;
    columns: number;
    rows: number;
    gapXmm: number;
    gapYmm: number;
  };

  /** ⚡ NUEVO: división opcional en 2 columnas dentro de la etiqueta */
  twoCols?: boolean;   // default: false
  splitPct?: number;   // 0–100, default: 50

  mode?: LabelMode;        // 'sheet' (por defecto) | 'roll'
  rollGapMm?: number;

  elements: LabelElement[];

  /** -------- Compatibilidad hacia atrás (props planas) -------- */
  widthMm?: number;
  heightMm?: number;
  marginMm?: number;

  pageWidthMm?: number;
  pageHeightMm?: number;
  cols?: number;
  rows?: number;
  gapXmm?: number;
  gapYmm?: number;
}
