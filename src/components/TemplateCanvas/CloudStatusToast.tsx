/**
 * CloudStatusToast.tsx
 *
 * The little coloured message that pops up in the bottom-right corner while a
 * template is being saved to the cloud ("Saving…", "✓ Saved", or "Save
 * failed"). When nothing is happening (status "idle") it shows nothing.
 */

export type CloudStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  status: CloudStatus;
}

// The background colour for each state.
const BACKGROUND: Record<Exclude<CloudStatus, 'idle'>, string> = {
  saving: '#475569',
  saved: '#16a34a',
  error: '#dc2626',
};

// The words shown for each state.
const MESSAGE: Record<Exclude<CloudStatus, 'idle'>, string> = {
  saving: 'Saving…',
  saved: '✓ Saved to your team',
  error: 'Save failed',
};

function CloudStatusToast({ status }: Props) {
  if (status === 'idle') return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 1700,
        padding: '8px 16px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
        boxShadow: '0 6px 20px rgba(15,23,42,0.25)',
        background: BACKGROUND[status],
      }}
    >
      {MESSAGE[status]}
    </div>
  );
}

export default CloudStatusToast;
