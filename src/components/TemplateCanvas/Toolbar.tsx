/**
 * Toolbar.tsx — Redesigned
 * SVG icons, tooltip system, keyboard shortcut hints, visual hierarchy
 */

import './Toolbar.css';
import { Icons } from './toolbar/icons';
import { IconBtn, Divider } from './toolbar/IconButton';
import ShapesMenu from './toolbar/ShapesMenu';
import PageSizeMenu from './toolbar/PageSizeMenu';
import ExportMenu from './toolbar/ExportMenu';
import { FrameActionsPortal } from '../../frame/FrameActions';

/* ── Toolbar ───────────────────────────────────────────────── */
export interface ToolbarProps {
  onAddParagraph ?: () => void;
  onAddRadio     ?: () => void;
  onAddCheckbox  ?: () => void;
  onAddDate      ?: () => void;
  onAddText       : () => void;
  onAddTable     ?: () => void;
  onAddImage     ?: () => void;
  onAddBarcode   ?: () => void;
  onAddChart     ?: () => void;
  onAddWatermark ?: () => void;
  onAddSignature ?: () => void;
  onAddLine      ?: () => void;
  onAddBox       ?: () => void;
  onAddRectangle ?: () => void;
  onAddTriangle  ?: () => void;
  onAddEllipse   ?: () => void;
  onDelete       ?: () => void;
  onSave         ?: () => void;
  onUndo         ?: () => void;
  onRedo         ?: () => void;
  canUndo        ?: boolean;
  canRedo        ?: boolean;
  // Data / batch controls — shown once a dataset is mapped onto the template.
  dataMapped     ?: boolean;
  isSingleMode   ?: boolean;
  totalRows      ?: number;
  previewRowIndex?: number;
  isExporting    ?: boolean;
  onPrevRow      ?: () => void;
  onNextRow      ?: () => void;
  onViewStructure?: () => void;
  onSendEmail    ?: () => void;
  onBulkExport   ?: () => void;
  onClearData    ?: () => void;
  onRebuildWithAi?: () => void;
  onExportPDF    ?: (format?: 'pdf' | 'zpl' | 'png' | 'jpeg') => void;
  onAddPage      ?: () => void;
  onToggleRulers ?: () => void;
  showRulers     ?: boolean;
  hasSelection   ?: boolean;
  hasElements    ?: boolean;
  onPageSizeChange?: (preset: string) => void;
  onCustomPageSize?: (widthInches: number, heightInches: number) => void;
  currentPageSize ?: string;
  customPageWidth ?: number;
  customPageHeight?: number;
  exportFormat?: 'pdf' | 'zpl' | 'png' | 'jpeg';
  onExportFormatChange?: (format: 'pdf' | 'zpl' | 'png' | 'jpeg') => void;
}

export default function Toolbar({
  onAddParagraph, onAddRadio, onAddCheckbox, onAddDate,
  onAddText, onAddTable, onAddImage, onAddBarcode, onAddChart, onAddWatermark, onAddSignature,
  onAddLine, onAddBox, onAddRectangle, onAddTriangle, onAddEllipse,
  onSave, onRebuildWithAi, onExportPDF,
  onUndo, onRedo, canUndo, canRedo,
  dataMapped, isSingleMode, totalRows = 0, previewRowIndex = 0, isExporting,
  onPrevRow, onNextRow, onViewStructure, onSendEmail, onBulkExport, onClearData,
  onToggleRulers, showRulers,
  hasElements,
  onPageSizeChange, currentPageSize,
  onCustomPageSize, customPageWidth, customPageHeight,
}: ToolbarProps) {
  const hasShapes = onAddLine || onAddBox || onAddRectangle || onAddTriangle || onAddEllipse;

  // Export formats offered in the Export menu (ZPL only for label page sizes).
  const exportFormats: ('pdf' | 'png' | 'jpeg' | 'zpl')[] = ['pdf', 'png', 'jpeg'];
  if (currentPageSize !== 'a4' && currentPageSize !== 'letter') exportFormats.push('zpl');

  return (
    <>
    <div className="tb tb--rail tb--labeled" role="toolbar" aria-label="Document tools">

      {/* ── Elements ── */}
      <div className="tb-group">
        <IconBtn icon={<Icons.Text />}  label="Text"  shortcut="T" onClick={onAddText} />
        {onAddTable && <IconBtn icon={<Icons.Table />} label="Table" shortcut="G" onClick={onAddTable} />}
        {onAddImage && <IconBtn icon={<Icons.Image />} label="Image" shortcut="I" onClick={onAddImage} />}
        {onAddBarcode && <IconBtn icon={<Icons.Barcode />} label="Barcode / QR" shortcut="B" onClick={onAddBarcode} />}
        {onAddChart && <IconBtn icon={<Icons.Chart />} label="Chart" shortcut="C" onClick={onAddChart} />}
        {onAddWatermark && <IconBtn icon={<Icons.Watermark />} label="Watermark" shortcut="W" onClick={onAddWatermark} />}
        {onAddSignature && <IconBtn icon={<Icons.Signature />} label="Digital signature" shortcut="S" onClick={onAddSignature} />}
      </div>

      {/* ── Form ── */}
      {(onAddParagraph || onAddRadio || onAddCheckbox || onAddDate) && (
        <>
          <Divider />
          <div className="tb-group">
            {onAddParagraph && <IconBtn icon={<Icons.Paragraph />} label="Paragraph" onClick={onAddParagraph} />}
            {onAddRadio     && <IconBtn icon={<Icons.Radio />}     label="Radio"     onClick={onAddRadio} />}
            {onAddCheckbox  && <IconBtn icon={<Icons.Checkbox />}  label="Checkbox"  onClick={onAddCheckbox} />}
            {onAddDate      && <IconBtn icon={<Icons.Date />}      label="Date field" onClick={onAddDate} />}
          </div>
        </>
      )}

      {/* ── Shapes ── */}
      {hasShapes && (
        <>
          <Divider />
          <div className="tb-group">
            <ShapesMenu
              onAddLine      ={onAddLine      || (() => {})}
              onAddBox       ={onAddBox       || (() => {})}
              onAddRectangle ={onAddRectangle || (() => {})}
              onAddTriangle  ={onAddTriangle  || (() => {})}
              onAddEllipse   ={onAddEllipse   || (() => {})}
            />
          </div>
        </>
      )}

      {/* Action buttons (add page, rulers, save/load/templates/AI/upload) moved
          to the top actions+export bar. Delete lives on the floating quick bar. */}

    </div>

      {/* ── Editor actions: undo/redo, page size, save, data, export ──
          These live in the FRAME's header now (relayout 4E), so the editor does not
          draw a second header of its own. The buttons and their handlers are
          unchanged — only where they land. Outside the frame they render in place. */}
      <FrameActionsPortal>
      <div className="tb tb--export" role="toolbar" aria-label="Actions and export">

        {/* Undo / redo */}
        {(onUndo || onRedo) && (
          <>
            <div className="tb-group">
              <IconBtn icon={<Icons.Undo />} label="Undo" shortcut="⌘Z"
                onClick={onUndo} disabled={!canUndo} variant="action" />
              <IconBtn icon={<Icons.Redo />} label="Redo" shortcut="⌘⇧Z"
                onClick={onRedo} disabled={!canRedo} variant="action" />
            </div>
            <Divider />
          </>
        )}

        {/* Action buttons moved out of the rail (add page now lives in the status chip) */}
        <div className="tb-group">
          {onPageSizeChange && (
            <PageSizeMenu
              currentPageSize={currentPageSize || 'a4'}
              onSelect={onPageSizeChange}
              onCustomSize={onCustomPageSize}
              customWidth={customPageWidth}
              customHeight={customPageHeight}
            />
          )}
          {onToggleRulers && (
            <IconBtn icon={<Icons.Ruler />} label={showRulers ? 'Hide rulers' : 'Show rulers'} shortcut="R"
              onClick={onToggleRulers} active={showRulers} />
          )}
          {onSave && (
            <IconBtn icon={<Icons.Save />} label="Save template" shortcut="⌘S"
              onClick={onSave} disabled={!hasElements} variant="action" />
          )}
          {/* Templates / Projects / Load template / Upload data file are GONE from the
              header (TC-0209). The header was carrying four doors into rooms you can
              already walk into:
                · Templates, Projects   → the /templates page (gallery + My projects)
                · Upload data file      → the right panel's Data tab
                · Load template (.json) → dropped outright: nothing in the app produces
                                          that file, so it could only import a hand-made
                                          one. */}
          {onRebuildWithAi && (
            <IconBtn icon={<Icons.Ai />} label="Rebuild with Mapdoc AI" onClick={onRebuildWithAi} variant="action" />
          )}
        </div>

        {/* Data / batch controls — only once a dataset is mapped */}
        {dataMapped && (
          <>
            <Divider />
            <div className="tb-group">
              {totalRows > 1 && !isSingleMode && (
                <div className="preview-nav">
                  <button type="button" className="preview-nav-btn"
                    onClick={onPrevRow} disabled={previewRowIndex === 0}>‹</button>
                  <span className="preview-nav-count">{previewRowIndex + 1} / {totalRows}</span>
                  <button type="button" className="preview-nav-btn"
                    onClick={onNextRow} disabled={previewRowIndex === totalRows - 1}>›</button>
                </div>
              )}
              <IconBtn icon={<Icons.Structure />} label="View data structure"
                onClick={onViewStructure} variant="action" />
              <IconBtn icon={<Icons.Share />} label="Share export"
                onClick={onSendEmail} disabled={isExporting || !hasElements} variant="action" />
              {!isSingleMode && (
                <IconBtn icon={<Icons.Bulk />} label="Bulk export — one per row"
                  onClick={onBulkExport} disabled={isExporting} variant="action" />
              )}
              <IconBtn icon={<Icons.Delete />} label="Clear data"
                onClick={onClearData} variant="danger" />
            </div>
          </>
        )}

        {/* Export — single button with a format menu */}
        {onExportPDF && (
          <>
            <Divider />
            <div className="tb-group tb-export-group">
              <ExportMenu
                formats={exportFormats}
                disabled={!hasElements}
                onExport={f => onExportPDF(f)}
              />
            </div>
          </>
        )}
      </div>
      </FrameActionsPortal>
    </>
  );
}
