export type LabelAlign = 'left' | 'center' | 'right';
export type LabelType  = 'text' | 'price' | 'barcode';

export interface LabelBarcodeOptions {
  symbology: 'CODE128' | 'EAN13' | 'EAN8' | 'QR';
  width: number;          // px por barra (JsBarcode)
  height: number;         // px alto
  displayValue: boolean;  // mostrar texto
}

export interface LabelElement {
  id?: string;

  // tipo de elemento
  type: LabelType;

  // “campo” de origen (para text/price/barcode)
  field?: 'nombre' | 'renglon1' | 'renglon2' | 'precioVenta' | 'codigoBarras';

  // posición/tamaño en %
  x: number; y: number; w: number; h: number;

  // estilo de texto
  fontSize?: number;
  bold?: boolean;
  align?: LabelAlign;
  uppercase?: boolean;

  // prefijo/sufijo p.ej. "$"
  prefix?: string;
  suffix?: string;

  // texto fijo (cuando quieras un literal)
  text?: string;

  // opciones de código de barras
  barcode?: LabelBarcodeOptions;
}

export interface LabelDesign {
  _id?: string;
  nombre: string;

  // tamaño de etiqueta (mm) — usamos campos planos
  widthMm: number;
  heightMm: number;
  marginMm?: number;

  // layout de hoja (opcional)
  pageWidthMm?: number;
  pageHeightMm?: number;
  cols?: number;
  rows?: number;
  gapXmm?: number;
  gapYmm?: number;

  elements: LabelElement[];
}
