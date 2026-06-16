'use strict';

/**
 * buildRowIr.js
 *
 * Builds the data (IR) for ONE record out of the full data set. Used by single
 * export (one chosen row), streaming bulk, and async bulk — they all render one
 * row at a time, so they all scope the data the same way here:
 *
 *   - copies the driver row's columns up into ir.fields (so {{placeholders}}
 *     resolve), plus a few helpers (__rowIndex / __index / __rowNumber),
 *   - narrows the driver collection to just this row, and
 *   - narrows each related collection to the rows that match this row's key.
 */

function buildRowIr(ir, driverCollectionKey, row, rowIndex, relatedCollections) {
  const driverColl = ir.collections[driverCollectionKey] || { rows: [], columns: [] };

  // Normalise row keys to lowercase so they match classifier's case-insensitive lookup
  const normRow = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])
  );

  const rowFields = {
    ...ir.fields,
    ...normRow,
    __rowIndex:  String(rowIndex),
    __index:     String(rowIndex + 1),
    __rowNumber: String(rowIndex + 1),
  };

  const scopedCollections = {
    ...ir.collections,
    [driverCollectionKey]: { ...driverColl, rows: [row] },
  };

  for (const [collKey, cfg] of Object.entries(relatedCollections || {})) {
    const coll = ir.collections[collKey];
    if (!coll) continue;
    const driverValue = String(row[cfg.driverRowField] ?? row[cfg.driverRowField?.toLowerCase()] ?? '');
    scopedCollections[collKey] = {
      ...coll,
      rows: coll.rows.filter(r =>
        String(r[cfg.filterColumn] ?? r[cfg.filterColumn?.toLowerCase()] ?? '') === driverValue
      ),
    };
  }

  return { ...ir, fields: rowFields, collections: scopedCollections };
}

module.exports = { buildRowIr };
