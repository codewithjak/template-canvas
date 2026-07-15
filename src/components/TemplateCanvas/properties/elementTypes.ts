/**
 * elementTypes.ts
 *
 * The shapes of every kind of element that can live on the canvas.
 * The Properties panel reads these shapes to know which inputs to show.
 *
 * Each "interface" below is just a list of the fields one element has.
 * `CanvasElement` is "any one of these element kinds".
 *
 * These types used to live at the top of PropertiesPanel.tsx. They were
 * moved here so the many small section components can share them.
 */

import type { LayoutTableElement } from '../../../model/layoutTable';
import type { PageNumberConfig } from '../PageNumberProperties';

export interface TextElementType {
  id: string;
  type: 'text';
  role?: 'watermark';
  content: string;
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
    width?: number;
    opacity?: number;
    rotation?: number;
    textAlign?: 'left' | 'center' | 'right';
    direction?: 'ltr' | 'rtl' | 'auto';
  };
  // Set when this text element shows the page number (footer zone only).
  pageNumber?: PageNumberConfig;
}

export interface ImageElementType {
  id: string;
  type: 'image';
  role?: 'signature';
  src: string;
  position: { x: number; y: number };
  style: {
    width: number;
    height: number;
    objectFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
    opacity?: number;
  };
  // Crop-to-shape (IMAGE_CROP_ARCHITECTURE.md): `src` holds the baked masked PNG;
  // `originalSrc` keeps the pre-crop image so the crop is re-editable and resettable.
  // Kept in sync with the parallel declaration in types/canvas.ts.
  originalSrc?: string;
  crop?: { shape: 'rect' | 'ellipse' | 'triangle'; rect: { x: number; y: number; w: number; h: number } };
}

export interface LineElementType {
  id: string;
  type: 'line';
  position: { x: number; y: number };
  style: {
    length: number;
    thickness: number;
    direction: 'horizontal' | 'vertical';
    color: string;
    style: 'solid' | 'dashed' | 'dotted';
    opacity?: number;
  };
}

export interface BoxElementType {
  id: string;
  type: 'box';
  position: { x: number; y: number };
  style: {
    width: number;
    height: number;
    borderWidth: number;
    borderColor: string;
    borderStyle: 'solid' | 'dashed' | 'dotted' | 'double';
    backgroundColor: string;
    opacity?: number;
    borderRadius?: number;
  };
}

export interface ParagraphElementType {
  id: string;
  type: 'paragraph';
  content: string;
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
    lineHeight?: number;
    direction?: 'ltr' | 'rtl' | 'auto';
  };
}

export interface RadioElementType {
  id: string;
  type: 'radio';
  options: number;
  selected?: string;
  orientation?: 'horizontal' | 'vertical';
  position: { x: number; y: number; relativeOffset?: number };
}

export interface CheckboxElementType {
  id: string;
  type: 'checkbox';
  count?: number;
  checkedValues?: string[];
  orientation?: 'horizontal' | 'vertical';
  position: { x: number; y: number; relativeOffset?: number };
}

export interface DateElementType {
  id: string;
  type: 'date';
  value?: string;
  time?: string;
  includeTime?: boolean;
  format?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MMM DD, YYYY' | 'DD Mon YYYY';
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
  };
}

export interface BarcodeElementType {
  id: string;
  type: 'barcode';
  content: string;
  position: { x: number; y: number };
  style: { width: number; height: number };
  barcode: {
    format: 'code128' | 'code39' | 'qrcode' | 'ean13' | 'upca' | 'itf14';
    showText: boolean;
  };
}

export interface ChartDatum { label: string; value: number }

export interface ChartElementType {
  id: string;
  type: 'chart';
  position: { x: number; y: number };
  style: { width: number; height: number; opacity?: number };
  chart: {
    kind: 'bar' | 'line' | 'pie';
    title?: string;
    data: ChartDatum[];
    palette: string[];
    showValues?: boolean;
    showLegend?: boolean;
    binding?: { enabled: boolean; collectionKey: string; labelField: string; valueField: string };
  };
}

/** Any one kind of element that can be selected on the canvas. */
export type CanvasElement =
  | TextElementType
  | ImageElementType
  | LineElementType
  | BoxElementType
  | ParagraphElementType
  | RadioElementType
  | CheckboxElementType
  | DateElementType
  | BarcodeElementType
  | ChartElementType
  | LayoutTableElement;

/**
 * The function the panel calls to save a change.
 * Give it the element's id and the fields you want to change.
 */
export type UpdateElement = (id: string, updates: Partial<CanvasElement>) => void;
