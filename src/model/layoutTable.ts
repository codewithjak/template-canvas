/** Structured layout table (columns + row templates + cells). Legacy `data: string[][]` tables are not supported. */

export type TableSchemaVersion = 2;

export function newStableId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export interface CellBinding {
  path: string;
  scope?: 'root' | 'item';
  fallback?: string;
}

export interface CellContent {
  type: 'text' | 'binding';
  value: string;
}

/** Per-cell typography overrides; unset fields inherit from table `style`. */
export interface TableCellStyle {
  textAlign?: 'left' | 'center' | 'right';
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  backgroundColor?: string;
}

export interface TableCell {
  id: string;
  content: CellContent;
  binding?: CellBinding;
  style?: TableCellStyle;
  span?: { rowSpan?: number; colSpan?: number };
  /** If set, this slot is covered by the merge anchor at (rowIndex, colIndex). */
  mergedInto?: { rowIndex: number; colIndex: number };
}

export interface TableColumn {
  id: string;
  width: number;
  minWidth?: number;
  widthMode?: 'fixed' | 'auto' | 'percentage';
  alignment?: 'left' | 'center' | 'right';
  hidden?: boolean;
}

export interface TableRow {
  id: string;
  cells: TableCell[];
  height?: number;
  autoHeight?: boolean;
}

export interface TableBinding {
  enabled?: boolean;
  collectionKey?: string;
  itemAlias?: string;
}

export interface LayoutTableElement {
  id: string;
  type: 'table';
  schemaVersion: TableSchemaVersion;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  columns: TableColumn[];
  headerRow?: TableRow;
  rows: TableRow[];
  binding?: TableBinding;
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
    borderColor?: string;
    borderWidth?: number;
    showBorders?: boolean;
  };
}

export function isLayoutTable(el: unknown): el is LayoutTableElement {
  return (
    typeof el === 'object' &&
    el !== null &&
    (el as LayoutTableElement).type === 'table' &&
    (el as LayoutTableElement).schemaVersion === 2 &&
    Array.isArray((el as LayoutTableElement).columns) &&
    Array.isArray((el as LayoutTableElement).rows)
  );
}

/** Old canvas tables used `data: string[][]` without schemaVersion. */
export function isLegacyCanvasTable(el: unknown): boolean {
  return (
    typeof el === 'object' &&
    el !== null &&
    (el as { type?: string }).type === 'table' &&
    Array.isArray((el as { data?: unknown }).data) &&
    (el as { schemaVersion?: number }).schemaVersion !== 2
  );
}

export function normalizeRect(r0: number, c0: number, r1: number, c1: number) {
  return {
    r0: Math.min(r0, r1),
    c0: Math.min(c0, c1),
    r1: Math.max(r0, r1),
    c1: Math.max(c0, c1),
  };
}

/** Resolve visual cell to merge anchor (for editing / selection). */
export function getAnchorIndices(table: LayoutTableElement, rowIndex: number, colIndex: number) {
  if (rowIndex === -1) {
    const cell = table.headerRow?.cells[colIndex];
    if (!cell) return { rowIndex, colIndex };
    if (cell.mergedInto) {
      return { rowIndex: -1, colIndex: cell.mergedInto.colIndex };
    }
    return { rowIndex, colIndex };
  }

  const cell = table.rows[rowIndex]?.cells[colIndex];
  if (!cell) return { rowIndex, colIndex };
  if (cell.mergedInto) {
    return { rowIndex: cell.mergedInto.rowIndex, colIndex: cell.mergedInto.colIndex };
  }
  return { rowIndex, colIndex };
}

function cloneRowsDeep(rows: TableRow[]): TableRow[] {
  return rows.map((row) => ({
    ...row,
    cells: row.cells.map((c) => ({ ...c, style: c.style ? { ...c.style } : undefined })),
  }));
}

/** Unmerge any merged region that intersects the rectangle [r0,c0]-[r1,c1]. */
function unmergeAllIntersecting(rows: TableRow[], r0: number, c0: number, r1: number, c1: number) {
  const rowCount = rows.length;
  const colCount = rows[0]?.cells.length ?? 0;
  const rectsIntersect = (ar: number, ac: number, ars: number, acs: number) =>
    !(ar + ars - 1 < r0 || ar > r1 || ac + acs - 1 < c0 || ac > c1);

  const anchors: { r: number; c: number }[] = [];
  for (let r = 0; r < rowCount; r += 1) {
    for (let c = 0; c < colCount; c += 1) {
      const sp = rows[r].cells[c].span;
      if (sp && ((sp.rowSpan ?? 1) > 1 || (sp.colSpan ?? 1) > 1)) {
        const rs = sp.rowSpan ?? 1;
        const cs = sp.colSpan ?? 1;
        if (rectsIntersect(r, c, rs, cs)) anchors.push({ r, c });
      }
    }
  }
  for (const { r, c } of anchors) {
    const sp = rows[r].cells[c].span!;
    const rs = sp.rowSpan ?? 1;
    const cs = sp.colSpan ?? 1;
    for (let rr = r; rr < r + rs && rr < rowCount; rr += 1) {
      for (let cc = c; cc < c + cs && cc < colCount; cc += 1) {
        rows[rr].cells[cc].mergedInto = undefined;
      }
    }
    rows[r].cells[c].span = undefined;
  }
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      if (r < rowCount && c < colCount) rows[r].cells[c].mergedInto = undefined;
    }
  }
}

export function applyRectMerge(table: LayoutTableElement, r0: number, c0: number, r1: number, c1: number): TableRow[] {
  const { r0: a, c0: b, r1: d, c1: e } = normalizeRect(r0, c0, r1, c1);
  if (a === d && b === e) return table.rows;

  const rows = cloneRowsDeep(table.rows);
  unmergeAllIntersecting(rows, a, b, d, e);

  const rowSpan = d - a + 1;
  const colSpan = e - b + 1;
  const anchor = rows[a].cells[b];
  anchor.span = { rowSpan, colSpan };
  anchor.mergedInto = undefined;

  for (let r = a; r <= d; r += 1) {
    for (let c = b; c <= e; c += 1) {
      if (r === a && c === b) continue;
      const slave = rows[r].cells[c];
      slave.mergedInto = { rowIndex: a, colIndex: b };
      slave.span = undefined;
    }
  }
  return rows;
}

export function stripAllMerges(rows: TableRow[]): TableRow[] {
  return cloneRowsDeep(rows).map((row) => ({
    ...row,
    cells: row.cells.map((c) => ({
      ...c,
      mergedInto: undefined,
      span: undefined,
    })),
  }));
}

export function stripMergesFromRow(row: TableRow): TableRow {
  const cloned = cloneRowsDeep([row])[0];
  return {
    ...cloned,
    cells: cloned.cells.map((c) => ({
      ...c,
      mergedInto: undefined,
      span: undefined,
    })),
  };
}

export function unmergeAt(table: LayoutTableElement, rowIndex: number, colIndex: number): TableRow[] {
  if (rowIndex === -1) {
    // handled by unmergeHeaderAt
    return table.rows;
  }
  const { rowIndex: ar, colIndex: ac } = getAnchorIndices(table, rowIndex, colIndex);
  const rows = cloneRowsDeep(table.rows);
  const anchor = rows[ar]?.cells[ac];
  if (!anchor) return table.rows;

  const rs = anchor.span?.rowSpan ?? 1;
  const cs = anchor.span?.colSpan ?? 1;

  for (let r = ar; r < ar + rs && r < rows.length; r += 1) {
    for (let c = ac; c < ac + cs && c < rows[r].cells.length; c += 1) {
      rows[r].cells[c].mergedInto = undefined;
    }
  }
  anchor.span = undefined;
  return rows;
}

export function applyHeaderMerge(table: LayoutTableElement, c0: number, c1: number): TableRow | undefined {
  if (!table.headerRow) return undefined;
  const { c0: b, c1: e } = normalizeRect(-1, c0, -1, c1);
  if (b === e) return table.headerRow;

  const header = cloneRowsDeep([table.headerRow])[0];
  // clear any existing merges intersecting this range
  unmergeAllIntersecting([header], 0, b, 0, e);

  const colSpan = e - b + 1;
  const anchor = header.cells[b];
  anchor.span = { rowSpan: 1, colSpan };
  anchor.mergedInto = undefined;

  for (let c = b; c <= e; c += 1) {
    if (c === b) continue;
    header.cells[c].mergedInto = { rowIndex: 0, colIndex: b };
    header.cells[c].span = undefined;
  }

  return header;
}

export function unmergeHeaderAt(table: LayoutTableElement, colIndex: number): TableRow | undefined {
  if (!table.headerRow) return undefined;
  const header = cloneRowsDeep([table.headerRow])[0];
  const cell = header.cells[colIndex];
  if (!cell) return table.headerRow;

  const anchorIndex = cell.mergedInto ? cell.mergedInto.colIndex : colIndex;
  const anchor = header.cells[anchorIndex];
  const cs = anchor.span?.colSpan ?? 1;
  for (let c = anchorIndex; c < anchorIndex + cs && c < header.cells.length; c += 1) {
    header.cells[c].mergedInto = undefined;
  }
  anchor.span = undefined;
  return header;
}

function emptyCell(): TableCell {
  return {
    id: newStableId(),
    content: { type: 'text', value: '' },
  };
}

function makeRow(columnCount: number, cellValues: string[]): TableRow {
  const cells: TableCell[] = [];
  for (let i = 0; i < columnCount; i += 1) {
    const c = emptyCell();
    c.content = { type: 'text', value: cellValues[i] ?? '' };
    cells.push(c);
  }
  return { id: newStableId(), cells };
}

// ─────────────────────────────────────────────────────────────────────────────
// Column structural operations
//
// Insert / remove / move operate on the whole table (columns + header + rows) so
// indices stay aligned. Because remapping merge anchors across a structural shift
// is error-prone, these strip merges first — a table with merged cells loses the
// merges when its column count/order changes, but never ends up with dangling
// merge pointers. Tables without merges are preserved exactly.
// ─────────────────────────────────────────────────────────────────────────────

function insertIntoArray<T>(arr: T[], index: number, item: T): T[] {
  const copy = arr.slice();
  copy.splice(Math.max(0, Math.min(index, copy.length)), 0, item);
  return copy;
}

function makeColumn(): TableColumn {
  return { id: newStableId(), width: 96, widthMode: 'fixed', alignment: 'left' };
}

function makeCell(value = ''): TableCell {
  const c = emptyCell();
  c.content = { type: 'text', value };
  return c;
}

/** Insert a new blank column at `index` (clamped). Returns a table patch. */
export function insertColumnAt(table: LayoutTableElement, index: number): Partial<LayoutTableElement> {
  const at = Math.max(0, Math.min(index, table.columns.length));
  const columns = insertIntoArray(table.columns, at, makeColumn());
  const header = table.headerRow ? stripMergesFromRow(table.headerRow) : undefined;
  const headerRow = header
    ? { ...header, cells: insertIntoArray(header.cells, at, makeCell(`Header ${table.columns.length + 1}`)) }
    : undefined;
  const rows = stripAllMerges(table.rows).map((r) => ({ ...r, cells: insertIntoArray(r.cells, at, makeCell()) }));
  return { columns, headerRow, rows };
}

/** Remove the column at `index`. No-op (empty patch) if only one column remains. */
export function removeColumnAt(table: LayoutTableElement, index: number): Partial<LayoutTableElement> {
  if (table.columns.length <= 1) return {};
  const at = Math.max(0, Math.min(index, table.columns.length - 1));
  const columns = table.columns.filter((_, i) => i !== at);
  const header = table.headerRow ? stripMergesFromRow(table.headerRow) : undefined;
  const headerRow = header ? { ...header, cells: header.cells.filter((_, i) => i !== at) } : undefined;
  const rows = stripAllMerges(table.rows).map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== at) }));
  return { columns, headerRow, rows };
}

/** Move the column at `from` to `to`. No-op (empty patch) if indices are invalid/equal. */
export function moveColumn(table: LayoutTableElement, from: number, to: number): Partial<LayoutTableElement> {
  const n = table.columns.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return {};
  const reorder = <T,>(arr: T[]): T[] => {
    const copy = arr.slice();
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  };
  const columns = reorder(table.columns);
  const header = table.headerRow ? stripMergesFromRow(table.headerRow) : undefined;
  const headerRow = header ? { ...header, cells: reorder(header.cells) } : undefined;
  const rows = stripAllMerges(table.rows).map((r) => ({ ...r, cells: reorder(r.cells) }));
  return { columns, headerRow, rows };
}

/** Set a single column's width (px), leaving everything else untouched. */
export function setColumnWidth(table: LayoutTableElement, index: number, width: number): Partial<LayoutTableElement> {
  const w = Math.max(40, Math.round(width));
  const columns = table.columns.map((c, i) => (i === index ? { ...c, width: w } : c));
  return { columns };
}

/** Single template row on canvas; iteration adds rows at render time. */
export function createDefaultLayoutTable(idPrefix: string): LayoutTableElement {
  const colWidths = [120, 120, 120];
  const columns: TableColumn[] = colWidths.map((width) => ({
    id: newStableId(),
    width,
    widthMode: 'fixed' as const,
    alignment: 'left' as const,
  }));

  const headerRow: TableRow = makeRow(3, ['Header 1', 'Header 2', 'Header 3']);
  const rows: TableRow[] = [makeRow(3, ['{{col_a}}', '{{col_b}}', '{{col_c}}'])];

  return {
    id: `${idPrefix}-${Date.now()}`,
    type: 'table',
    schemaVersion: 2,
    position: { x: 48, y: 48 },
    columns,
    headerRow,
    rows,
    binding: {
      enabled: false,
      collectionKey: '',
      itemAlias: 'item',
    },
    style: {
      fontSize: 13,
      fontWeight: 'normal',
      color: '#111827',
      fontFamily: 'Arial, sans-serif',
      borderColor: '#d1d5db',
      borderWidth: 1,
    },
  };
}
