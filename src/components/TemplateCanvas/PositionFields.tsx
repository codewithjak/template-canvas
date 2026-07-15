/**
 * PositionFields.tsx
 *
 * The X / Y position pair for the floating format bars, in the bar's own idiom
 * (`tfb-field` + `tfb-num`). It is the single position editor shared by both
 * TextFormatBar and ElementFormatBar, so neither grows its own copy.
 *
 * `position` is a top-level field on every element (not `style`), so it patches
 * `{ position }` through the same UpdateElement handler the bars already use —
 * nothing new reaches the model. Spreading the existing position preserves any
 * sibling field (radio/checkbox `relativeOffset`), which its own control edits.
 */

import type { CanvasElement, UpdateElement } from './properties/elementTypes';
import { mergePosition } from './positionPatch';

interface Props {
  element: CanvasElement;
  onUpdate: UpdateElement;
}

export default function PositionFields({ element, onUpdate }: Props) {
  const setPos = (patch: Partial<{ x: number; y: number }>) =>
    onUpdate(element.id, { position: mergePosition(element.position, patch) } as Partial<CanvasElement>);

  return (
    <>
      <div className="tfb-field">
        <span className="tfb-label">X</span>
        <input
          className="tfb-num"
          type="number"
          min={0}
          value={Math.round(element.position.x)}
          onChange={e => setPos({ x: Number(e.target.value) || 0 })}
          aria-label="X position"
        />
      </div>
      <div className="tfb-field">
        <span className="tfb-label">Y</span>
        <input
          className="tfb-num"
          type="number"
          min={0}
          value={Math.round(element.position.y)}
          onChange={e => setPos({ y: Number(e.target.value) || 0 })}
          aria-label="Y position"
        />
      </div>
    </>
  );
}
