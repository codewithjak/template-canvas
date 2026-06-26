/**
 * Builder.tsx — preview route for the graph-canvas builder (platform P1).
 *
 * Unguarded for now so the new canvas is easy to open during development.
 * Gives GraphCanvasBase a full-viewport box (it sizes to its container).
 * Swap CloudCanvas → AgentCanvas / UICanvas to preview the other packs.
 */

import { CloudCanvas } from '../builder/graph/packs/cloud/CloudCanvas';

export default function Builder() {
  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <CloudCanvas />
    </div>
  );
}
