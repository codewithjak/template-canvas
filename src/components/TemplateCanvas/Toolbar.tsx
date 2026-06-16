/**
 * Toolbar.tsx — Redesigned
 * SVG icons, tooltip system, keyboard shortcut hints, visual hierarchy
 */

import React from 'react';
import './Toolbar.css';
import { Icons } from './toolbar/icons';
import { Tooltip, IconBtn, Divider } from './toolbar/IconButton';
import ShapesMenu from './toolbar/ShapesMenu';
import PageSizeMenu from './toolbar/PageSizeMenu';

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
  onOpenTemplates?: () => void;
  onLoad         ?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload       ?: () => void;
  onExportPDF    ?: () => void;
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
  onDelete, onSave, onOpenTemplates, onLoad, onUpload, onExportPDF, onAddPage,
  onToggleRulers, showRulers,
  hasSelection, hasElements,
  onPageSizeChange, currentPageSize,
  onCustomPageSize, customPageWidth, customPageHeight,
  exportFormat, onExportFormatChange,
}: ToolbarProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const hasShapes = onAddLine || onAddBox || onAddRectangle || onAddTriangle || onAddEllipse;

  return (
    <div className="tb" role="toolbar" aria-label="Document toolbar">

      {/* ── Page Size ── */}
      {onPageSizeChange && (
        <>
          <div className="tb-group">
            <PageSizeMenu
              currentPageSize={currentPageSize || 'a4'}
              onSelect={onPageSizeChange}
              onCustomSize={onCustomPageSize}
              customWidth={customPageWidth}
              customHeight={customPageHeight}
            />
          </div>
          <Divider />
        </>
      )}

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

      {/* ── Pages ── */}
      {onAddPage && (
        <>
          <Divider />
          <div className="tb-group">
            <IconBtn icon={<Icons.AddPage />} label="Add page" shortcut="⌘↵" onClick={onAddPage} variant="page" />
          </div>
        </>
      )}

      {/* ── View ── */}
      {onToggleRulers && (
        <>
          <Divider />
          <div className="tb-group">
            <IconBtn
              icon={<Icons.Ruler />}
              label={showRulers ? 'Hide rulers' : 'Show rulers'}
              shortcut="R"
              onClick={onToggleRulers}
              active={showRulers}
            />
          </div>
        </>
      )}

      {/* ── File actions ── */}
      <Divider />
      <div className="tb-group">
        {onSave && (
          <IconBtn icon={<Icons.Save />} label="Save template" shortcut="⌘S"
            onClick={onSave} disabled={!hasElements} variant="action" />
        )}
        {onOpenTemplates && (
          <IconBtn icon={<Icons.Library />} label="My templates"
            onClick={onOpenTemplates} variant="action" />
        )}
        {onLoad && (
          <>
            <input ref={fileInputRef} type="file" accept=".json"
              onChange={onLoad} style={{ display: 'none' }} />
            <IconBtn icon={<Icons.Load />} label="Load template" shortcut="⌘O"
              onClick={() => fileInputRef.current?.click()} variant="action" />
          </>
        )}
        {onUpload && (
          <IconBtn icon={<Icons.Upload />} label="Upload data file"
            onClick={onUpload} variant="action" />
        )}
      </div>

      {/* ── Export — primary CTA ── */}
      {onExportPDF && (
        <>
          <Divider />
          <div className="tb-group tb-export-group">
            {onExportFormatChange && (
              <div className="tb-format-toggle">
                {(['pdf', 'png', 'jpeg'] as const).map(f => (
                  <button
                    key={f}
                    className={`tb-format-btn ${exportFormat === f ? 'tb-format-btn--active' : ''}`}
                    onClick={() => onExportFormatChange(f)}
                    aria-label={`${f.toUpperCase()} format`}
                  >{f.toUpperCase()}</button>
                ))}
                {/* ZPL only makes sense for thermal/label page sizes */}
                {currentPageSize !== 'a4' && currentPageSize !== 'letter' && (
                  <button
                    className={`tb-format-btn ${exportFormat === 'zpl' ? 'tb-format-btn--active' : ''}`}
                    onClick={() => onExportFormatChange('zpl')}
                    aria-label="ZPL format"
                  >ZPL</button>
                )}
              </div>
            )}
            <Tooltip label={`Export ${exportFormat?.toUpperCase() || 'PDF'}`} shortcut="⌘E">
              <button
                className={`tb-btn tb-btn--primary ${!hasElements ? 'tb-btn--disabled' : ''}`}
                onClick={onExportPDF}
                disabled={!hasElements}
                aria-label={`Export ${exportFormat?.toUpperCase() || 'PDF'}`}
              >
                <Icons.Export />
                <span className="tb-export-label">Export {exportFormat?.toUpperCase() || 'PDF'}</span>
              </button>
            </Tooltip>
          </div>
        </>
      )}

      {/* ── Delete ── */}
      {hasSelection && onDelete && (
        <>
          <Divider />
          <div className="tb-group">
            <IconBtn icon={<Icons.Delete />} label="Delete selected" shortcut="⌫"
              onClick={onDelete} variant="danger" />
          </div>
        </>
      )}

    </div>
  );
}
