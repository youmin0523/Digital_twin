import { useEffect, useRef, useCallback } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';

/**
 * useShipSimulation
 *
 * Mirrors the mainLoop() from arctic-hybrid.html lines 5647-5719.
 * Drives the requestAnimationFrame loop, advancing simulation time,
 * computing ship position/heading from the route or manual controls,
 * and dispatching HUD / state updates.
 *
 * External service functions (ship physics, camera, ocean, ice, etc.)
 * are expected to be injected via the `services` parameter so this hook
 * remains a pure orchestrator.
 */

// 14-day voyage in seconds
const TOTAL_SECONDS = 14 * 86400;

/**
 * @param {object} options
 * @param {object}  options.services   - Collection of service functions:
 *   routePos(progress)             -> { lat, lon }
 *   routeHeading(progress)         -> number (degrees)
 *   getShipPosLonLat()             -> { lat, lon }  (manual mode)
 *   updateHUD(pos)                 -> void
 *   updateShipPhysics(dt)          -> void
 *   updateShipMotion(dt, lat)      -> void
 *   updateCamera(dt)               -> void
 *   updateOcean(dt, time)          -> void
 *   syncIce(lon, lat)              -> void
 *   runRoutingEvaluation()         -> void
 * @param {React.MutableRefObject} options.keysRef  - from useManualControl
 */
export default function useShipSimulation({ services = {}, keysRef } = {}) {
  const state = useAppState();
  const dispatch = useDispatch();

  // Mutable refs that persist across frames without causing re-renders
  const lastTSRef = useRef(null);
  const rafIdRef = useRef(null);
  const tTimeRef = useRef(0);

  // Snapshot the latest state values into refs so the rAF callback always
  // sees them without depending on React's batched state updates.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const servicesRef = useRef(services);
  useEffect(() => {
    servicesRef.current = services;
  }, [services]);

  // ── Simulation tick (one frame) ────────────────────────────────────────────
  const tick = useCallback(
    (ts) => {
      rafIdRef.current = requestAnimationFrame(tick);

      const s = stateRef.current;
      const svc = servicesRef.current;

      // Delta-time calculation (capped at 50 ms to avoid spiral-of-death)
      if (lastTSRef.current === null) lastTSRef.current = ts;
      const dt = Math.min((ts - lastTSRef.current) / 1000, 0.05);
      lastTSRef.current = ts;

      // ── Advance simulation clock (auto mode only) ──────────────────────
      let simElapsed = s.simElapsed;
      let simProgress = s.simProgress;

      if (s.isSimulating && !s.manualMode) {
        simElapsed += dt * s.multiplier;
        simProgress = Math.min(simElapsed / TOTAL_SECONDS, 1);

        dispatch({ type: 'SET_ELAPSED', payload: simElapsed });
        dispatch({ type: 'SET_PROGRESS', payload: simProgress });

        // Voyage complete
        if (simProgress >= 1) {
          dispatch({ type: 'SET_SIMULATING', payload: false });
        }
      }

      // ── Timeline day sync ──────────────────────────────────────────────
      const dayValue = Math.floor(simProgress * 14);
      if (dayValue !== s.timelineDay) {
        dispatch({ type: 'SET_TIMELINE', payload: dayValue });
      }

      // ── Compute ship position ──────────────────────────────────────────
      let pos;
      if (s.manualMode && typeof svc.getShipPosLonLat === 'function') {
        pos = svc.getShipPosLonLat();
      } else if (typeof svc.routePos === 'function') {
        pos = svc.routePos(simProgress);
      } else {
        // Fallback: hold current position
        pos = { lat: s.shipState.lat, lon: s.shipState.lon };
      }

      const heading = s.manualMode
        ? s.manualHeading
        : typeof svc.routeHeading === 'function'
          ? svc.routeHeading(simProgress)
          : s.shipState.heading;

      dispatch({
        type: 'SET_SHIP_STATE',
        payload: { lat: pos.lat, lon: pos.lon, heading },
      });

      // ── HUD update ─────────────────────────────────────────────────────
      if (typeof svc.updateHUD === 'function') {
        svc.updateHUD(pos);
      }

      // ── Route fitness re-evaluation (every ~120 sim-seconds) ───────────
      if (s.isSimulating && typeof svc.runRoutingEvaluation === 'function') {
        const prevElapsed = simElapsed - dt * s.multiplier;
        const prevSlot = Math.floor(prevElapsed / 120);
        const currSlot = Math.floor(simElapsed / 120);
        if (currSlot > prevSlot) {
          svc.runRoutingEvaluation();
        }
      }

      // ── Three.js render pass (only when in a 3-D camera mode) ─────────
      tTimeRef.current += dt;

      if (typeof svc.updateShipPhysics === 'function') {
        svc.updateShipPhysics(dt);
      }
      if (typeof svc.updateShipMotion === 'function') {
        svc.updateShipMotion(dt, pos.lat);
      }
      if (typeof svc.updateCamera === 'function') {
        svc.updateCamera(dt);
      }
      if (typeof svc.updateOcean === 'function') {
        svc.updateOcean(dt, tTimeRef.current);
      }
      if (typeof svc.syncIce === 'function') {
        svc.syncIce(pos.lon, pos.lat);
      }
    },
    [dispatch],
  );

  // ── Start / Stop the rAF loop based on simulation state ────────────────
  useEffect(() => {
    // Always run the render loop (even when paused) so the 3-D scene stays
    // interactive. The simulation clock advancement is guarded by isSimulating.
    lastTSRef.current = null;
    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [tick]);

  // ── Imperative controls exposed to the App component ───────────────────
  const start = useCallback(() => {
    lastTSRef.current = null;
    dispatch({ type: 'SET_SIMULATING', payload: true });
  }, [dispatch]);

  const stop = useCallback(() => {
    dispatch({ type: 'SET_SIMULATING', payload: false });
  }, [dispatch]);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
    lastTSRef.current = null;
    tTimeRef.current = 0;
  }, [dispatch]);

  return { start, stop, reset, TOTAL_SECONDS };
}
