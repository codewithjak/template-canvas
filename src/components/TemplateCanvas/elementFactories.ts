/**
 * elementFactories.ts
 *
 * Little "maker" functions — one per kind of element you can add to the page.
 * Each one returns a brand-new element with sensible default settings and a
 * unique id. They used to be long object literals crammed inside the toolbar
 * handlers; pulling them out here keeps TemplateCanvas short and lets each
 * default be read on its own.
 *
 * Every id ends with the current time so two elements never share an id.
 */

import type {
  BarcodeElementType,
  BoxElementType,
  ChartElementType,
  CheckboxElementType,
  DateElementType,
  ImageElementType,
  LineElementType,
  ParagraphElementType,
  RadioElementType,
  TextElementType,
} from '../../types/canvas';
import { DEFAULT_CHART_PALETTE } from '../../types/canvas';

/** A unique id like "text-1718500000000". */
const newId = (prefix: string) => `${prefix}-${Date.now()}`;

// Where a freshly-added element first appears, near the top-left.
const START_POSITION = { x: 50, y: 50 };

export function createTextElement(): TextElementType {
  return {
    id: newId('text'),
    type: 'text',
    content: 'New Text',
    position: { ...START_POSITION },
    style: { fontSize: 16, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif' },
  };
}

export function createParagraphElement(): ParagraphElementType {
  return {
    id: newId('paragraph'),
    type: 'paragraph',
    content: 'Add your text here…',
    position: { ...START_POSITION },
    style: { fontSize: 16, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif', lineHeight: 24 },
  };
}

export function createImageElement(): ImageElementType {
  return {
    id: newId('image'),
    type: 'image',
    src: '{{image_url}}',
    position: { ...START_POSITION },
    style: { width: 200, height: 200, objectFit: 'contain', opacity: 100 },
  };
}

export function createWatermarkElement(): TextElementType {
  return {
    id: newId('watermark'),
    type: 'text',
    role: 'watermark',
    content: 'CONFIDENTIAL',
    position: { x: 88, y: 515 },
    style: { fontSize: 72, fontWeight: 'bold', color: '#94a3b8', fontFamily: 'Arial, sans-serif', width: 620, opacity: 22, rotation: -30, textAlign: 'center' },
  };
}

export function createSignatureElement(): ImageElementType {
  return {
    id: newId('signature'),
    type: 'image',
    role: 'signature',
    src: '{{digital_signature}}',
    position: { x: 500, y: 890 },
    style: { width: 220, height: 90, objectFit: 'contain', opacity: 100 },
  };
}

export function createLineElement(): LineElementType {
  return {
    id: newId('line'),
    type: 'line',
    position: { ...START_POSITION },
    style: { length: 200, thickness: 2, direction: 'horizontal', color: '#000000', style: 'solid', opacity: 100 },
  };
}

export function createBoxElement(): BoxElementType {
  return {
    id: newId('box'),
    type: 'box',
    shape: 'box',
    position: { ...START_POSITION },
    style: { width: 200, height: 200, borderWidth: 1, borderColor: '#000000', borderStyle: 'solid', backgroundColor: 'transparent', opacity: 100, borderRadius: 0 },
  };
}

export function createRectangleElement(): BoxElementType {
  return {
    id: newId('rectangle'),
    type: 'box',
    shape: 'rectangle',
    position: { ...START_POSITION },
    style: { width: 220, height: 140, borderWidth: 1, borderColor: '#007bff', borderStyle: 'solid', backgroundColor: '#e7f1ff', opacity: 100, borderRadius: 0 },
  };
}

export function createTriangleElement(): BoxElementType {
  return {
    id: newId('triangle'),
    type: 'box',
    shape: 'triangle',
    position: { ...START_POSITION },
    style: { width: 140, height: 120, borderWidth: 0, borderColor: '#000000', borderStyle: 'solid', backgroundColor: '#ffb200', opacity: 100, borderRadius: 0 },
  };
}

export function createEllipseElement(): BoxElementType {
  return {
    id: newId('ellipse'),
    type: 'box',
    shape: 'ellipse',
    position: { ...START_POSITION },
    style: { width: 200, height: 120, borderWidth: 1, borderColor: '#2a9d8f', borderStyle: 'solid', backgroundColor: '#d8f3ef', opacity: 100, borderRadius: 9999 },
  };
}

export function createRadioElement(): RadioElementType {
  return {
    id: newId('radio'),
    type: 'radio',
    options: 2,
    selected: '',
    orientation: 'vertical',
    position: { x: 50, y: 50, relativeOffset: 8 },
  };
}

export function createCheckboxElement(): CheckboxElementType {
  return {
    id: newId('checkbox'),
    type: 'checkbox',
    count: 1,
    checkedValues: [],
    orientation: 'vertical',
    position: { x: 50, y: 50, relativeOffset: 8 },
  };
}

export function createDateElement(): DateElementType {
  return {
    id: newId('date'),
    type: 'date',
    value: '',
    time: '',
    includeTime: false,
    format: 'MM/DD/YYYY',
    position: { ...START_POSITION },
    style: { fontSize: 14, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif' },
  };
}

export function createBarcodeElement(): BarcodeElementType {
  return {
    id: newId('barcode'),
    type: 'barcode',
    content: '{{tracking_no}}',
    position: { ...START_POSITION },
    style: { width: 200, height: 100 },
    barcode: { format: 'code128', showText: true },
  };
}

export function createChartElement(): ChartElementType {
  return {
    id: newId('chart'),
    type: 'chart',
    position: { ...START_POSITION },
    style: { width: 320, height: 220, opacity: 100 },
    chart: {
      kind: 'bar',
      title: 'Chart title',
      data: [
        { label: 'Q1', value: 42 },
        { label: 'Q2', value: 58 },
        { label: 'Q3', value: 35 },
        { label: 'Q4', value: 71 },
      ],
      palette: [...DEFAULT_CHART_PALETTE],
      showValues: true,
      showLegend: true,
    },
  };
}
