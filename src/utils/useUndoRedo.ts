import { useCallback, useRef, useState } from 'react';
import type { SetStateAction } from 'react';

/**
 * useHistoryState — a drop-in replacement for useState that records an
 * undo/redo history of the value. It accepts both direct values and functional
 * updaters, so existing `setX(prev => ...)` call sites keep working unchanged.
 *
 * History is kept in refs (past / future stacks) and the "next" value is
 * computed eagerly from a ref of the latest state, so it stays correct even
 * when several updates fire synchronously in one event handler.
 */
export function useHistoryState<T>(initial: T) {
  const [state, setState] = useState<T>(initial);

  // Always points at the latest committed value (updated during render and,
  // eagerly, inside set/undo/redo so back-to-back updates chain correctly).
  const stateRef = useRef<T>(state);
  stateRef.current = state;

  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const LIMIT = 100;

  const set = useCallback((updater: SetStateAction<T>) => {
    const prev = stateRef.current;
    const next = typeof updater === 'function'
      ? (updater as (p: T) => T)(prev)
      : updater;
    if (Object.is(next, prev)) return;
    past.current.push(prev);
    if (past.current.length > LIMIT) past.current.shift();
    future.current = [];
    stateRef.current = next;
    setState(next);
  }, []);

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    const prev = past.current.pop() as T;
    future.current.push(stateRef.current);
    stateRef.current = prev;
    setState(prev);
  }, []);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    const next = future.current.pop() as T;
    past.current.push(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);

  return {
    state,
    set,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  } as const;
}
