/**
 * UploadFooter.tsx
 *
 * The bottom bar of the wizard during the Upload and Mapping steps. It shows a
 * hint on the left and the Back / Next / Confirm buttons on the right. It only
 * shows things and calls back — the parent decides what each button does.
 */

interface Props {
  /** Which step the footer is showing for. */
  phase: 'upload' | 'mapping';
  hint: string;
  hintReady: boolean;
  onBack: () => void;
  onNext: () => void;
  onConfirm: () => void;
  nextDisabled: boolean;
  confirmDisabled: boolean;
}

function UploadFooter({
  phase,
  hint,
  hintReady,
  onBack,
  onNext,
  onConfirm,
  nextDisabled,
  confirmDisabled,
}: Props) {
  return (
    <div className="upload-footer">
      <span className={`upload-footer-hint ${hintReady ? 'hint-ready' : ''}`}>
        {hint}
      </span>
      <div className="upload-footer-actions">
        <button type="button" className="upload-btn-secondary" onClick={onBack}>
          ← Back
        </button>
        {phase === 'upload' && (
          <button
            type="button"
            className="upload-btn-primary"
            disabled={nextDisabled}
            onClick={onNext}
          >
            Next →
          </button>
        )}
        {phase === 'mapping' && (
          <button
            type="button"
            className="upload-btn-primary"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            Confirm mapping
          </button>
        )}
      </div>
    </div>
  );
}

export default UploadFooter;
