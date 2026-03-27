/**
 * Data API Service
 * Fetches CSV data from API or local file and converts to JSON
 */

import Papa from 'papaparse';

export type DataRow = {
  [key: string]: string | number;
}

/**
 * Fetch CSV data from file
 * @param csvPath - Path to CSV file
 * @returns Promise with array of data objects
 */
export async function fetchCSVData(csvPath: string = 'sample_data.csv'): Promise<DataRow[]> {
  try {
    const response = await fetch(`/${csvPath}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV: ${response.statusText}`);
    }
    
    const csvText = await response.text();
    
    return parseCSV(csvText);
  } catch (error) {
    console.error('Error fetching CSV data:', error);
    throw error;
  }
}

/**
 * Parse CSV text to JSON array
 * @param csvText - CSV file content as string
 * @returns Array of data objects
 */
export function parseCSV(csvText: string): Promise<DataRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        if (results.errors.length > 0) {
          reject(new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`));
          return;
        }
        
        const data = results.data as DataRow[];
        if (data.length === 0) {
          reject(new Error('CSV file is empty or has no valid data'));
          return;
        }
        
        resolve(data);
      },
      error: (error) => {
        reject(new Error(`CSV parsing failed: ${error.message}`));
      },
    });
  });
}

/**
 * Fetch data from API endpoint (JSON response)
 * @param apiUrl - API endpoint URL
 * @returns Promise with data object or array
 */
export async function fetchDataFromAPI(apiUrl: string): Promise<DataRow | DataRow[]> {
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
    
    const data = await response.json();
    
    // Handle both single object and array responses
    if (Array.isArray(data)) {
      return data as DataRow[];
    }
    
    return data as DataRow;
  } catch (error) {
    console.error('Error fetching data from API:', error);
    throw error;
  }
}

/**
 * Fetch data by ID from API
 * @param apiUrl - Base API URL
 * @param id - Data record ID
 * @returns Promise with single data object
 */
export async function fetchDataById(apiUrl: string, id: string | number): Promise<DataRow> {
  const url = `${apiUrl}/${id}`;
  const data = await fetchDataFromAPI(url);
  
  if (Array.isArray(data)) {
    throw new Error('Expected single object but received array');
  }
  
  return data;
}

/**
 * Fetch multiple data records
 * @param apiUrl - API endpoint URL
 * @param ids - Array of record IDs
 * @returns Promise with array of data objects
 */
export async function fetchMultipleData(apiUrl: string, ids: (string | number)[]): Promise<DataRow[]> {
  const promises = ids.map(id => fetchDataById(apiUrl, id));
  return Promise.all(promises);
}
