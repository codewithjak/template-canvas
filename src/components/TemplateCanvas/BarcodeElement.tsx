import { useDraggable } from '@dnd-kit/core';
import './BarcodeElement.css';

interface BarcodeElementProps {
  id: string;
  content: string;
  position: { x: number; y: number };
  style: { width: number; height: number };
  barcode: {
    format: 'code128' | 'code39' | 'qrcode' | 'ean13' | 'upca' | 'itf14';
    showText: boolean;
  };
  isSelected: boolean;
  onSelect: () => void;
}

const FORMAT_LABELS: Record<string, string> = {
  code128: 'Code 128',
  code39:  'Code 39',
  qrcode:  'QR Code',
  ean13:   'EAN-13',
  upca:    'UPC-A',
  itf14:   'ITF-14',
};

/** Extract the field name from {{field_name}} or return the raw content */
function extractFieldName(content: string): string {
  const match = content.match(/^\{\{(.+?)\}\}$/);
  return match ? match[1].trim() : content;
}

export default function BarcodeElement({
  id, content, position, style, barcode, isSelected, onSelect,
}: BarcodeElementProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });

  const dragStyle = transform
    ? { left: position.x + transform.x, top: position.y + transform.y }
    : { left: position.x, top: position.y };

  const isQR = barcode.format === 'qrcode';
  const fieldName = extractFieldName(content);
  const isPlaceholder = /^\{\{.+\}\}$/.test(content);

  return (
    <div
      ref={setNodeRef}
      className={`barcode-element ${isSelected ? 'barcode-element--selected' : ''}`}
      style={{
        ...dragStyle,
        width: style.width,
        height: style.height,
        position: 'absolute',
      }}
      onClick={e => { e.stopPropagation(); onSelect(); }}
      {...listeners}
      {...attributes}
    >
      <div className="barcode-element__placeholder">
        {/* Faint barcode/QR pattern background */}
        <div className="barcode-element__pattern">
          {isQR ? (
            <svg viewBox="0 0 100 100" width="100%" height="100%" opacity="0.12">
              <rect x="5" y="5" width="25" height="25" fill="currentColor" />
              <rect x="70" y="5" width="25" height="25" fill="currentColor" />
              <rect x="10" y="10" width="15" height="15" fill="white" />
              <rect x="75" y="10" width="15" height="15" fill="white" />
              <rect x="13" y="13" width="9" height="9" fill="currentColor" />
              <rect x="78" y="13" width="9" height="9" fill="currentColor" />
              <rect x="40" y="40" width="20" height="20" fill="currentColor" />
              <rect x="45" y="45" width="10" height="10" fill="white" />
              <rect x="5" y="70" width="25" height="25" fill="currentColor" />
              <rect x="10" y="75" width="15" height="15" fill="white" />
              <rect x="13" y="78" width="9" height="9" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 200 80" preserveAspectRatio="none" width="100%" height="100%" opacity="0.10">
              {Array.from({ length: 40 }, (_, i) => (
                <rect
                  key={i}
                  x={i * 5}
                  y="0"
                  width={i % 3 === 0 ? 3 : i % 5 === 0 ? 1 : 2}
                  height="80"
                  fill="currentColor"
                />
              ))}
            </svg>
          )}
        </div>

        {/* Field name overlay */}
        <div className="barcode-element__field-info">
          <span className="barcode-element__icon">
            {isQR ? '⊞' : '▐▌▌▐'}
          </span>
          <span className={`barcode-element__field-name ${isPlaceholder ? '' : 'barcode-element__field-name--literal'}`}>
            {fieldName}
          </span>
        </div>
      </div>

      <div className="barcode-element__badge">
        {FORMAT_LABELS[barcode.format] || barcode.format}
      </div>
    </div>
  );
}
