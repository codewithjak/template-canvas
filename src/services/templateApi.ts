/**
 * Template API Service
 * Fetches template JSON from API or local file
 */

export interface Template {
  version: string;
  name?: string;
  elements: any[];
}

/**
 * Fetch template from API endpoint
 * @param templateId - Template identifier or path
 * @returns Promise with template JSON
 */
export async function fetchTemplate(templateId: string = 'cover.json'): Promise<Template> {
  try {
    // For now, fetch from public folder
    // In production, this would be: `/api/templates/${templateId}`
    const response = await fetch(`/${templateId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch template: ${response.statusText}`);
    }
    
    const template: Template = await response.json();
    
    // Validate template structure
    if (!template.elements || !Array.isArray(template.elements)) {
      throw new Error('Invalid template format: missing elements array');
    }
    
    return template;
  } catch (error) {
    console.error('Error fetching template:', error);
    throw error;
  }
}

/**
 * Fetch template from custom API endpoint
 * @param apiUrl - Full API URL
 * @returns Promise with template JSON
 */
export async function fetchTemplateFromAPI(apiUrl: string): Promise<Template> {
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const template: Template = await response.json();
    
    // Validate template structure
    if (!template.elements || !Array.isArray(template.elements)) {
      throw new Error('Invalid template format: missing elements array');
    }
    
    return template;
  } catch (error) {
    console.error('Error fetching template from API:', error);
    throw error;
  }
}
