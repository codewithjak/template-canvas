/**
 * layoutTableCellHelpers.ts
 *
 * Small helpers shared by the two layout-table boxes (the table box and the
 * table typography box). They deal with the "active cell" — the single cell
 * the user last clicked inside a table.
 *
 * A row index of -1 means the header row (which is stored separately from the
 * body rows), so the helpers check for that special case.
 */

import type { LayoutTableElement, TableCell } from '../../../model/layoutTable';
import type { CanvasElement, UpdateElement } from './elementTypes';

/** Which cell the user clicked, as a table id plus a row/column number. */
export interface ActiveCellRef {
  tableId: string;
  rowIndex: number;
  colIndex: number;
}

/** The clicked cell, looked up: its row/column and the cell data itself. */
export interface ResolvedActiveCell {
  rc: { rowIndex: number; colIndex: number } | null;
  cell: TableCell | null;
}

/**
 * Find the cell the user clicked inside this table. Returns nulls when no cell
 * in *this* table is active.
 */
export function resolveActiveCell(
  table: LayoutTableElement,
  activeCell: ActiveCellRef | null,
): ResolvedActiveCell {
  if (!activeCell || activeCell.tableId !== table.id) {
    return { rc: null, cell: null };
  }

  const rc = { rowIndex: activeCell.rowIndex, colIndex: activeCell.colIndex };
  const cell =
    activeCell.rowIndex === -1
      ? (table.headerRow?.cells[activeCell.colIndex] ?? null)
      : (table.rows[activeCell.rowIndex]?.cells[activeCell.colIndex] ?? null);

  return { rc, cell };
}

/**
 * Change one cell in a table and save it. Handles the header row (rowIndex -1)
 * and normal body rows.
 */
export function patchLayoutTableCell(
  table: LayoutTableElement,
  rowIndex: number,
  colIndex: number,
  patch: Partial<TableCell>,
  onUpdate: UpdateElement,
): void {
  if (rowIndex === -1) {
    const headerRow = table.headerRow;
    if (!headerRow) return;
    const patched = {
      ...headerRow,
      cells: headerRow.cells.map((cell, ci) => (ci === colIndex ? { ...cell, ...patch } : cell)),
    };
    onUpdate(table.id, { headerRow: patched } as Partial<CanvasElement>);
    return;
  }

  const rows = table.rows.map((row, ri) => {
    if (ri !== rowIndex) return row;
    return {
      ...row,
      cells: row.cells.map((cell, ci) => (ci === colIndex ? { ...cell, ...patch } : cell)),
    };
  });
  onUpdate(table.id, { rows } as Partial<CanvasElement>);
}
