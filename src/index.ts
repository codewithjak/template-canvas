// Main component export
export { default as TemplateCanvas } from './components/TemplateCanvas/TemplateCanvas';
export type { TemplateCanvasProps } from './components/TemplateCanvas/TemplateCanvas';

// Type exports
export type {
  TextElementType,
  TableElementType,
  CanvasElement,
  TemplateData,
} from './components/TemplateCanvas/types';

// Utility exports
export { saveTemplate, loadTemplate, downloadTemplate } from './components/TemplateCanvas/utils';

// CSS must be imported separately by consumers:
// import 'template-canvas-editor/styles.css'

