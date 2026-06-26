/**
 * UICanvas.tsx — the UI-component builder. Thin file over the shared parent,
 * run in layout mode.
 */

import { GraphCanvasBase } from '../../GraphCanvasBase';
import { uiPack } from './index';

export const UICanvas = () => <GraphCanvasBase pack={uiPack} />;
