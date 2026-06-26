/**
 * CloudCanvas.tsx — the cloud builder. A thin file over the shared parent.
 *
 * All cloud logic lives in ./catalog ./compile ./lint ./run; the canvas itself
 * is just GraphCanvasBase wired with the cloud pack. New builders copy this
 * one-liner shape.
 */

import { GraphCanvasBase } from '../../GraphCanvasBase';
import { cloudPack } from './index';

export const CloudCanvas = () => <GraphCanvasBase pack={cloudPack} />;
