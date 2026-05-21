/**
 * useVoyagePlayback.js
 * ====================
 * backend simulate_voyage trace 를 rAF 루프로 재생.
 *
 * API
 *   const pb = useVoyagePlayback();
 *   pb.loadIceClass("Arc4")   // fetch + 상태 초기화
 *   pb.play() / pb.pause() / pb.seek(t_hours) / pb.setSpeed(60)
 *   pb.state: { trace, tHours, isPlaying, speed, newEvents }
 *
 * newEvents 는 이전 프레임 → 현재 프레임 사이에 발생한 이벤트 배열.
 * Caller 가 매 render 마다 읽어 토스트/로그에 반영 (useEffect).
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { loadTrace, eventsBetween } from '../services/voyageTrace';

export const PLAYBACK_SPEEDS = [1, 10, 60, 300];

export default function useVoyagePlayback() {
  const [trace, setTrace] = useState(null);
  const [tHours, setTHours] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [newEvents, setNewEvents] = useState([]);
  const [iceClass, setIceClass] = useState(null);

  // rAF 내부 상태 (리렌더 유발 없음)
  const rafRef = useRef(null);
  const lastTsRef = useRef(0);
  const tHoursRef = useRef(0);
  const prevFiredTRef = useRef(0);
  const traceRef = useRef(null);
  const speedRef = useRef(60);
  const playingRef = useRef(false);
  const arrivedLoggedRef = useRef(false);

  // state → ref 동기화
  useEffect(() => {
    traceRef.current = trace;
  }, [trace]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  const loop = useCallback((ts) => {
    if (!playingRef.current) return;
    const tr = traceRef.current;
    if (!tr) return;
    const last = lastTsRef.current || ts;
    const dtMs = ts - last;
    lastTsRef.current = ts;

    // 재생 속도: speed 배율 적용 (1 실시간 초 당 speed 시뮬 초)
    // 시뮬 시간(초) = dtMs/1000 × speed → 시간(hour) = × speed/3600
    const dtHours = (dtMs / 1000) * (speedRef.current / 3600);
    let newT = tHoursRef.current + dtHours;

    const duration = tr.metadata.duration_hours;
    if (newT >= duration) {
      newT = duration;
      playingRef.current = false;
      setIsPlaying(false);
      if (!arrivedLoggedRef.current) {
        // eslint-disable-next-line no-console
        console.log(`[VoyagePlayback] arrived at t=${duration.toFixed(1)}h`);
        arrivedLoggedRef.current = true;
      }
    }

    const fired = eventsBetween(tr, prevFiredTRef.current, newT);
    prevFiredTRef.current = newT;
    tHoursRef.current = newT;
    setTHours(newT);
    if (fired.length > 0) setNewEvents(fired);

    if (playingRef.current) {
      rafRef.current = requestAnimationFrame(loop);
    }
  }, []);

  const play = useCallback(() => {
    if (!traceRef.current) return;
    if (tHoursRef.current >= traceRef.current.metadata.duration_hours) {
      // 끝에 도달하면 seek 필요
      return;
    }
    playingRef.current = true;
    setIsPlaying(true);
    lastTsRef.current = 0;
    arrivedLoggedRef.current = false;
    // eslint-disable-next-line no-console
    console.log(`[VoyagePlayback] play started, speed=${speedRef.current}x`);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setIsPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const seek = useCallback((target) => {
    if (!traceRef.current) return;
    const clamped = Math.max(
      0,
      Math.min(traceRef.current.metadata.duration_hours, target),
    );
    tHoursRef.current = clamped;
    prevFiredTRef.current = clamped; // seek 은 과거 이벤트 재발화 안 함
    setTHours(clamped);
    arrivedLoggedRef.current = false;
  }, []);

  const loadIceClass = useCallback(
    async (cls) => {
      pause();
      const tr = await loadTrace(cls);
      traceRef.current = tr;
      setTrace(tr);
      setIceClass(cls);
      tHoursRef.current = 0;
      prevFiredTRef.current = 0;
      setTHours(0);
      setNewEvents([]);
      arrivedLoggedRef.current = false;
    },
    [pause],
  );

  const changeSpeed = useCallback((s) => {
    speedRef.current = s;
    setSpeed(s);
  }, []);

  // cleanup
  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return {
    trace,
    iceClass,
    tHours,
    isPlaying,
    speed,
    newEvents,
    loadIceClass,
    play,
    pause,
    seek,
    setSpeed: changeSpeed,
  };
}
