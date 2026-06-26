/**
 * AgentCanvas.tsx — the agent-workflow builder. Thin file over the shared parent.
 */

import { GraphCanvasBase } from '../../GraphCanvasBase';
import { agentPack } from './index';

export const AgentCanvas = () => <GraphCanvasBase pack={agentPack} />;
