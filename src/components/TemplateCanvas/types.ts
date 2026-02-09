export interface TextElementType {
  id: string;
  type: 'text';
  content: string;
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
  };
}

export interface TableElementType {
  id: string;
  type: 'table';
  data: string[][];
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
  };
}

export type CanvasElement = TextElementType | TableElementType;

export interface TemplateData {
  version: string;
  elements: CanvasElement[];
}

