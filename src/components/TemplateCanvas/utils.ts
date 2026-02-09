import type { TemplateData, CanvasElement } from './types';

export const saveTemplate = (elements: CanvasElement[]): string => {
  const template: TemplateData = {
    version: '1.0',
    elements: elements,
  };
  return JSON.stringify(template, null, 2);
};

export const loadTemplate = (json: string): CanvasElement[] => {
  try {
    const template: TemplateData = JSON.parse(json);
    if (template.elements && Array.isArray(template.elements)) {
      return template.elements;
    }
    throw new Error('Invalid template format: missing elements array');
  } catch (error) {
    throw new Error(`Failed to load template: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const downloadTemplate = (elements: CanvasElement[], filename?: string): void => {
  const json = saveTemplate(elements);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `template-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

