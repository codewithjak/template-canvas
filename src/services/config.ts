/**
 * src/services/config.ts
 * Central configuration for all service modules.
 * Uses Vite's environment variable convention (VITE_ prefix).
 */

export const API_BASE =
  import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
