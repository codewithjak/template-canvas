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

  // Savepoint: the value at the last durable save (or load). `isDirty` means
  // "changed since then", which is NOT what canUndo means — canUndo is "any
  // history since mount" and stays true after a save or an undo back to the
  // saved state. State is immutable here, so reference identity is exact:
  // undoing back to the savepoint restores the same reference → clean again.
  // Kept in React state (not a ref) so isDirty derives purely during render.
  const [savedState, setSavedState] = useState<T>(initial);

  // Mirrors savedState for synchronous reads from event handlers (see
  // isAtSavepoint), where the render closure's savedState may be a frame stale.
  const savedRef = useRef<T>(initial);

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

  /**
   * Mark a value as durably saved — `isDirty` becomes false while the live
   * state equals it. Pass the EXACT snapshot that was persisted (not "current"):
   * a save serializes at click time, so if edits raced in during the async
   * save, marking `current` would stamp those un-persisted edits as saved.
   * Passing the click-time snapshot keeps `isDirty` true when a race happened.
   * Defaults to the current value for callers with no in-flight window.
   */
  const markSaved = useCallback((value: T = stateRef.current) => {
    savedRef.current = value;
    setSavedState(value);
  }, []);

  /**
   * The latest committed value, readable synchronously from async callbacks
   * (e.g. after `await`) where the render closure is stale. Never read during
   * render — use `state` there.
   */
  const getLatest = useCallback(() => stateRef.current, []);

  /**
   * Is the live value back at the savepoint? Reads refs, so it is correct
   * immediately after undo/redo inside the same event handler, before React
   * re-renders and `isDirty` catches up.
   */
  const isAtSavepoint = useCallback(() => Object.is(stateRef.current, savedRef.current), []);

  /**
   * Replace the value wholesale as a LOAD, not an edit: history is cleared
   * and the new value becomes the savepoint. Loading a document must not arm
   * dirty-driven machinery (autosave, leave-site prompts) or occupy undo.
   */
  const reset = useCallback((value: T) => {
    past.current = [];
    future.current = [];
    stateRef.current = value;
    savedRef.current = value;
    setSavedState(value);
    setState(value);
  }, []);

  return {
    state,
    set,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    isDirty: !Object.is(state, savedState),
    markSaved,
    getLatest,
    isAtSavepoint,
    reset,
  } as const;
}
