import './PageRulers.css';

export interface PageRulerSelection {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

interface PageRulersProps {
  width: number;
  height: number;
  selection: PageRulerSelection | null;
}

type RulerTick = {
  value: number;
  kind: 'minor' | 'major' | 'label';
};

const TICK_STEP = 10;
const MAJOR_STEP = 50;
const LABEL_STEP = 100;

function makeTicks(length: number): RulerTick[] {
  const ticks: RulerTick[] = [];
  for (let value = 0; value <= length; value += TICK_STEP) {
    ticks.push({
      value,
      kind: value % LABEL_STEP === 0 ? 'label' : value % MAJOR_STEP === 0 ? 'major' : 'minor',
    });
  }
  return ticks;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function PageRulers({ width, height, selection }: PageRulersProps) {
  const horizontalTicks = makeTicks(width);
  const verticalTicks = makeTicks(height);

  const rawX = selection?.x ?? null;
  const rawY = selection?.y ?? null;
  const selectedX = rawX !== null ? clamp(rawX, 0, width) : null;
  const selectedY = rawY !== null ? clamp(rawY, 0, height) : null;
  const selectionWidth =
    selection?.width != null && selectedX !== null
      ? clamp(selection.width, 0, width - selectedX)
      : null;
  const selectionHeight =
    selection?.height != null && selectedY !== null
      ? clamp(selection.height, 0, height - selectedY)
      : null;

  return (
    <div className="page-rulers" aria-hidden="true">
      <div className="page-ruler-corner">px</div>

      <div className="page-ruler page-ruler--horizontal">
        {selectionWidth !== null && selectedX !== null && (
          <div
            className="page-ruler-selection page-ruler-selection--horizontal"
            style={{ left: selectedX, width: selectionWidth }}
          />
        )}
        {horizontalTicks.map((tick) => (
          <div
            key={`x-${tick.value}`}
            className={`page-ruler-tick page-ruler-tick--${tick.kind}`}
            style={{ left: tick.value }}
          >
            {tick.kind === 'label' && (
              <span className="page-ruler-label page-ruler-label--horizontal">
                {tick.value}
              </span>
            )}
          </div>
        ))}
        {selectedX !== null && (
          <div className="page-ruler-marker page-ruler-marker--x" style={{ left: selectedX }}>
            <span>x {Math.round(rawX ?? selectedX)}px</span>
          </div>
        )}
      </div>

      <div className="page-ruler page-ruler--vertical">
        {selectionHeight !== null && selectedY !== null && (
          <div
            className="page-ruler-selection page-ruler-selection--vertical"
            style={{ top: selectedY, height: selectionHeight }}
          />
        )}
        {verticalTicks.map((tick) => (
          <div
            key={`y-${tick.value}`}
            className={`page-ruler-tick page-ruler-tick--${tick.kind}`}
            style={{ top: tick.value }}
          >
            {tick.kind === 'label' && (
              <span className="page-ruler-label page-ruler-label--vertical">
                {tick.value}
              </span>
            )}
          </div>
        ))}
        {selectedY !== null && (
          <div className="page-ruler-marker page-ruler-marker--y" style={{ top: selectedY }}>
            <span>y {Math.round(rawY ?? selectedY)}px</span>
          </div>
        )}
      </div>

      {selectedX !== null && (
        <div className="page-ruler-guide page-ruler-guide--x" style={{ left: selectedX }} />
      )}
      {selectedY !== null && (
        <div className="page-ruler-guide page-ruler-guide--y" style={{ top: selectedY }} />
      )}
      {selectedX !== null && selectedY !== null && (
        <div
          className="page-ruler-coordinate"
          style={{
            left: clamp(selectedX + 8, 8, width - 118),
            top: clamp(selectedY + 8, 8, height - 30),
          }}
        >
          x {Math.round(rawX ?? selectedX)} px / y {Math.round(rawY ?? selectedY)} px
        </div>
      )}
    </div>
  );
}

export default PageRulers;
