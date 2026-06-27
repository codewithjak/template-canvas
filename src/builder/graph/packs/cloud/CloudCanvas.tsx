/**
 * CloudCanvas.tsx — the cloud builder. Thin wrapper over the shared parent that
 * adds the cloud-specific "Run target" bar (which AWS connection Plan/Apply use)
 * and passes the selected connectionId down. All other cloud logic lives in
 * ./catalog ./compile ./lint ./run ./architect.
 */

import { useState } from 'react';
import { GraphCanvasBase } from '../../GraphCanvasBase';
import { ConnectionBar } from './ConnectionBar';
import { cloudPack } from './index';
import './CloudCanvas.css';

export const CloudCanvas = () => {
  const [connectionId, setConnectionId] = useState<string | undefined>();
  return (
    <div className="cloud-canvas">
      <ConnectionBar value={connectionId} onChange={setConnectionId} />
      <div className="cloud-canvas-body">
        <GraphCanvasBase pack={cloudPack} connectionId={connectionId} />
      </div>
    </div>
  );
};
