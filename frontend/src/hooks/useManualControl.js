import { useEffect, useRef, useCallback } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';

/**
 * useManualControl
 *
 * Mirrors the keyboard handling logic from arctic-hybrid.html lines 2717-2754.
 * Tracks WASD, arrow keys, Q/E, X, Shift, Space, and the B key (binoculars toggle).
 *
 * Returns the live key map ref so the simulation loop can read pressed keys
 * without triggering re-renders every frame.
 */

// Key codes that should have their default browser behaviour suppressed
const PREVENTED_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyX',
  'KeyQ',
  'KeyE',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

export default function useManualControl() {
  const state = useAppState();
  const dispatch = useDispatch();

  // Mutable key map — read by the rAF simulation loop without causing re-renders
  const keysRef = useRef({});

  // Track the latest state values in refs so event handlers always see fresh data
  const currentModeRef = useRef(state.currentMode);
  const manualModeRef = useRef(state.manualMode);
  const binocularsRef = useRef(state.binocularsActive);

  useEffect(() => {
    currentModeRef.current = state.currentMode;
  }, [state.currentMode]);

  useEffect(() => {
    manualModeRef.current = state.manualMode;
  }, [state.manualMode]);

  useEffect(() => {
    binocularsRef.current = state.binocularsActive;
  }, [state.binocularsActive]);

  // ── keydown handler ────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e) => {
      keysRef.current[e.code] = true;

      // Prevent default scrolling / page actions for simulation keys
      if (PREVENTED_KEYS.has(e.code)) {
        e.preventDefault();
      }

      // B key — binoculars (only in BRIDGE + manual mode, and not already active)
      if (
        e.code === 'KeyB' &&
        currentModeRef.current === 'BRIDGE' &&
        manualModeRef.current &&
        !binocularsRef.current
      ) {
        dispatch({ type: 'SET_BINOCULARS', payload: true });
      }
    },
    [dispatch],
  );

  // ── keyup handler ──────────────────────────────────────────────────────────
  const handleKeyUp = useCallback(
    (e) => {
      keysRef.current[e.code] = false;

      // Release binoculars when B is released
      if (e.code === 'KeyB') {
        dispatch({ type: 'SET_BINOCULARS', payload: false });
      }
    },
    [dispatch],
  );

  // ── mount / unmount ────────────────────────────────────────────────────────
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return { keys: keysRef };
}
