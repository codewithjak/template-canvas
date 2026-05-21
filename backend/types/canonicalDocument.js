/**
 * backend/types/canonicalDocument.js
 *
 * The Canonical IR — the strict contract between every parser and every
 * downstream consumer (renderer, server, mapping engine).
 *
 * Shape
 * ─────
 * {
 *   fields:      Record<string, string>
 *   collections: Record<string, { columns: string[], rows: Record<string,string>[] }>
 *   source:      { type, fileName?, sheets?, warnings[] }
 * }
 *
 * Rules
 * ─────
 * - Every field value is a string. Never null, undefined, or a number.
 * - Every collection row cell is a string.
 * - validateIR() is called by every parser before returning. Violations throw
 *   immediately so bugs surface at parse time, never silently in the PDF.
 */

'use strict';

function createIR(sourceMeta = {}) {
  return {
    fields: {},
    collections: {},
    source: {
      type:     sourceMeta.type     || 'json',
      fileName: sourceMeta.fileName || undefined,
      sheets:   sourceMeta.sheets   || undefined,
      warnings: sourceMeta.warnings || [],
    },
  };
}

function validateIR(ir) {
  if (!ir || typeof ir !== 'object') {
    throw new Error('[IR] Result is not an object.');
  }

  if (!ir.fields || typeof ir.fields !== 'object' || Array.isArray(ir.fields)) {
    throw new Error('[IR] "fields" must be a plain object.');
  }
  for (const [k, v] of Object.entries(ir.fields)) {
    if (typeof v !== 'string') {
      throw new Error(`[IR] fields["${k}"] is ${typeof v} — all field values must be strings.`);
    }
  }

  if (!ir.collections || typeof ir.collections !== 'object' || Array.isArray(ir.collections)) {
    throw new Error('[IR] "collections" must be a plain object.');
  }
  for (const [key, col] of Object.entries(ir.collections)) {
    if (!Array.isArray(col.columns)) {
      throw new Error(`[IR] collections["${key}"].columns must be an array.`);
    }
    if (!Array.isArray(col.rows)) {
      throw new Error(`[IR] collections["${key}"].rows must be an array.`);
    }
    col.rows.forEach((row, ri) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(`[IR] collections["${key}"].rows[${ri}] must be a plain object.`);
      }
      for (const [ck, cv] of Object.entries(row)) {
        if (typeof cv !== 'string') {
          throw new Error(`[IR] collections["${key}"].rows[${ri}]["${ck}"] must be a string.`);
        }
      }
    });
  }

  if (!ir.source || typeof ir.source !== 'object') {
    throw new Error('[IR] "source" must be a plain object.');
  }

  return ir;
}

module.exports = { createIR, validateIR };