/**
 * OutcomeOverlay.tsx — persistent banner shown after an apply: how many
 * resources are live + captured outputs. The canvas nodes themselves turn green
 * (GraphCanvasBase applies a class); this is the summary + outputs.
 */

import './OutcomeOverlay.css';

export function OutcomeOverlay({ count, outputs, onClose }: {
  count: number;
  outputs: Record<string, string>;
  onClose: () => void;
}) {
  const entries = Object.entries(outputs);
  return (
    <div className="oo-root">
      <div className="oo-head">
        <span className="oo-dot" />
        <strong>{count} resource(s) live</strong>
        <button className="oo-close" onClick={onClose}>×</button>
      </div>
      {entries.length > 0 && (
        <div className="oo-outputs">
          {entries.map(([k, v]) => (
            <div className="oo-out" key={k}>
              <span className="oo-out-k">{k}</span>
              <span className="oo-out-v">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
