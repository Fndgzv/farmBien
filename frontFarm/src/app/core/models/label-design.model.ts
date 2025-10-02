export type LabelElementType = 'text' | 'barcode' | 'price';

export interface LabelElement {
  type: LabelElementType;
  field?: 'nombre' | 'codigoBarras' | 'renglon1' | 'renglon2' | 'precioVenta' | 'custom';
  text?: string;
  x: number; y: number; w: number; h: number;
  fontSize?: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  uppercase?: boolean;
  prefix?: string;
  suffix?: string;
  barcode?: {
    symbology: 'CODE128' | 'EAN13' | 'EAN8' | 'QR';
    width?: number;
    height?: number;
    displayValue?: boolean;
  };
}

export interface LabelDesign {
  _id?: string;
  nombre: string;
  size: { widthMm: number; heightMm: number; marginMm: number };
  layout: { pageWidthMm: number; pageHeightMm: number; columns: number; rows: number; gapXmm: number; gapYmm: number; };
  elements: LabelElement[];
}
