/**
 * VoyageAutoCam.jsx
 * =================
 * Voyage Playback 이벤트 자동 전환 — "리플레이 카메라 디렉터".
 *
 * 중요 이벤트가 발생하면 카메라를 자동으로 선미 추적(FOLLOW)으로 전환하고,
 * N초 후 원래 모드로 복귀. 사용자가 도중에 직접 모드를 바꾸면 복귀 취소
 * (사용자 의도 우선).
 *
 * headless 컴포넌트 — DOM 출력 없음.
 */

import { useEffect, useRef } from 'react';

// 자동 전환을 트리거할 이벤트 타입 (의미 높은 순간)
const SIGNIFICANT_EVENTS = new Set([
  'start_escort',
  'rendezvous',
  'intercept_failed',
  'arrive',
]);

// 자동 전환 후 복귀까지 대기 시간 (ms)
const HOLD_MS = 5000;

export default function VoyageAutoCam({
  active,
  newEvents,
  currentMode,
  dispatch,
}) {
  // 복귀할 이전 모드 저장
  const savedModeRef = useRef(null);
  // 사용자가 전환 후 직접 모드 바꾸면 복귀 취소하기 위한 플래그
  const autoSwitchedRef = useRef(false);
  const restoreTimerRef = useRef(null);
  // 최신 mode 추적 (timer 콜백에서 stale closure 방지)
  const modeRef = useRef(currentMode);

  useEffect(() => {
    modeRef.current = currentMode;
    // 자동 전환 중(autoSwitchedRef=true)에 mode 가 FOLLOW 가 아닌 값으로 바뀌면
    // 사용자가 직접 조작한 것 — 복귀 취소.
    if (autoSwitchedRef.current && currentMode !== 'FOLLOW') {
      autoSwitchedRef.current = false;
      savedModeRef.current = null;
      if (restoreTimerRef.current) {
        clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
    }
  }, [currentMode]);

  useEffect(() => {
    if (!active || !newEvents || newEvents.length === 0) return;

    // 중요 이벤트가 이번 배치에 있는지 확인
    const hasSignificant = newEvents.some((ev) => SIGNIFICANT_EVENTS.has(ev.type));
    if (!hasSignificant) return;

    const curMode = modeRef.current;

    // 이미 FOLLOW 면 모드 전환 생략 (타이머만 연장)
    if (curMode !== 'FOLLOW') {
      // 첫 자동 전환일 때만 이전 모드 저장 (이미 auto 중이면 유지)
      if (!autoSwitchedRef.current) {
        savedModeRef.current = curMode;
      }
      autoSwitchedRef.current = true;
      dispatch({ type: 'SET_MODE', payload: 'FOLLOW' });
      dispatch({ type: 'SET_BRIDGE_VISIBLE', payload: true });
    }

    // 복귀 타이머 리셋/설정
    if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    restoreTimerRef.current = setTimeout(() => {
      restoreTimerRef.current = null;
      const prev = savedModeRef.current;
      // 자동 전환이 아직 유효하고, 저장된 이전 모드가 있으면 복귀
      if (autoSwitchedRef.current && prev && prev !== 'FOLLOW') {
        autoSwitchedRef.current = false;
        savedModeRef.current = null;
        dispatch({ type: 'SET_MODE', payload: prev });
        dispatch({ type: 'SET_BRIDGE_VISIBLE', payload: false });
      } else {
        // 사용자가 FOLLOW 를 명시 선택했던 경우 등 — 상태 정리만
        autoSwitchedRef.current = false;
        savedModeRef.current = null;
      }
    }, HOLD_MS);
  }, [active, newEvents, dispatch]);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    };
  }, []);

  return null;
}
