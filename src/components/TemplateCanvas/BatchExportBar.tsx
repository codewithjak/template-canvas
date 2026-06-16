/**
 * BatchExportBar.tsx
 *
 * The strip of controls shown once data has been uploaded. It tells the user
 * how many records are bound, lets them step through records to preview them,
 * and holds the buttons for viewing the data structure, exporting one PDF,
 * bulk-exporting every record, and clearing the data.
 *
 * It only shows things and calls back — all the real work happens in the
 * parent (TemplateCanvas).
 */

interface Props {
  /** True when the template renders one big report instead of one-per-record. */
  isSingleMode: boolean;
  totalRows: number;
  previewRowIndex: number;
  isExporting: boolean;
  hasElements: boolean;
  onPrevRow: () => void;
  onNextRow: () => void;
  onViewStructure: () => void;
  onExport: () => void;
  onBulkExport: () => void;
  onClearData: () => void;
}

function BatchExportBar({
  isSingleMode,
  totalRows,
  previewRowIndex,
  isExporting,
  hasElements,
  onPrevRow,
  onNextRow,
  onViewStructure,
  onExport,
  onBulkExport,
  onClearData,
}: Props) {
  // Stepping through records only makes sense with more than one record.
  const showRecordNav = totalRows > 1 && !isSingleMode;

  return (
    <div className="batch-export-controls">
      <div className="batch-export-summary">
        <span>
          {isSingleMode
            ? 'Full report — all data'
            : `${totalRows} record${totalRows !== 1 ? 's' : ''} bound`}
        </span>
        {showRecordNav && (
          <span className="preview-label">
            &nbsp;— previewing record {previewRowIndex + 1} of {totalRows}
          </span>
        )}
      </div>

      <div className="batch-export-actions">
        {showRecordNav && (
          <div className="preview-nav">
            <button
              type="button" className="preview-nav-btn"
              onClick={onPrevRow}
              disabled={previewRowIndex === 0}
            >‹</button>
            <span className="preview-nav-count">
              {previewRowIndex + 1} / {totalRows}
            </span>
            <button
              type="button" className="preview-nav-btn"
              onClick={onNextRow}
              disabled={previewRowIndex === totalRows - 1}
            >›</button>
          </div>
        )}

        <button
          type="button"
          className="batch-control-btn"
          onClick={onViewStructure}
          title="Inspect data relationships"
        >
          View structure
        </button>

        <button
          type="button"
          className="batch-control-btn batch-control-btn--primary"
          onClick={onExport}
          disabled={isExporting || !hasElements}
          title={`Export PDF for record ${previewRowIndex + 1}`}
        >
          Export PDF
        </button>

        {!isSingleMode && (
          <button
            type="button"
            className="batch-control-btn batch-control-btn--bulk"
            onClick={onBulkExport}
            disabled={isExporting}
            title="Generate one PDF per row"
          >
            Bulk Export ↗
          </button>
        )}

        <button type="button" className="clear-button" onClick={onClearData}>
          Clear Data
        </button>
      </div>
    </div>
  );
}

export default BatchExportBar;
