/**
 * HelpOverlay.tsx — a short, always-available "how to use the builder" guide.
 * Opened from the palette's "?" button. Covers the node interactions people
 * most often miss (containers, connecting, deleting).
 */

import './HelpOverlay.css';

const STEPS: [string, string][] = [
  ['Add nodes', 'Click items in the palette — or type a description (e.g. “voice agent app”) and press ✨ to generate a starter design.'],
  ['Edit a node', 'Click a node, then edit its fields in the right-hand panel.'],
  ['Place inside a container', 'Some nodes need a parent (e.g. an EC2 belongs in a Subnet). Select the node and choose its “Container” in the panel — this clears the related warning.'],
  ['Connect nodes', 'Hover a node’s edge to reveal a handle, then drag from it to another node to wire them (e.g. EC2 → RDS).'],
  ['Delete', 'Select a node and press Delete / Backspace, or use the “Delete node” button.'],
  ['Fix issues', 'The panel at bottom-right lists findings — red blocks, amber warns. Click one to jump to its node.'],
  ['Ship it', 'Compile ▸ Terraform to see the code, then Plan ▸ review → Approve & Apply.'],
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="help-root">
      <div className="help-head">
        <strong>How to use the builder</strong>
        <button className="help-close" onClick={onClose}>×</button>
      </div>
      <ol className="help-list">
        {STEPS.map(([title, body]) => (
          <li key={title}><b>{title}.</b> {body}</li>
        ))}
      </ol>
    </div>
  );
}
