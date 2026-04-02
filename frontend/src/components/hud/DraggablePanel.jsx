import React, { useState, useRef, useEffect, useCallback } from 'react';

const DRAG_THRESHOLD = 8; // px — 이 이상 움직여야 드래그 시작
const IGNORE_TAGS = new Set(['INPUT', 'BUTTON', 'SELECT', 'LABEL', 'TEXTAREA']);
// 테스트 주석
export default function DraggablePanel({ children, defaultX, defaultY, style, className, id }) {
  const [pos, setPos] = useState({ x: defaultX ?? 0, y: defaultY ?? 0 });
  const state = useRef({ down: false, dragging: false, startX: 0, startY: 0, offX: 0, offY: 0, targetX: defaultX ?? 0, targetY: defaultY ?? 0, rafId: null });
  const panelRef = useRef(null);

  const onPointerDown = useCallback((e) => {
    // input/button/select/label 위에서는 드래그 무시
    if (IGNORE_TAGS.has(e.target.tagName)) return;
    state.current.down = true;
    state.current.dragging = false;
    state.current.startX = e.clientX;
    state.current.startY = e.clientY;
    state.current.offX = e.clientX - state.current.targetX;
    state.current.offY = e.clientY - state.current.targetY;
  }, []);

  useEffect(() => {
    function onPointerMove(e) {
      const s = state.current;
      if (!s.down) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (!s.dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        s.dragging = true;
        document.body.style.pointerEvents = 'none';
        document.body.style.userSelect = 'none';
      }
      const nx = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - s.offX));
      const ny = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - s.offY));
      s.targetX = nx;
      s.targetY = ny;
      setPos({ x: nx, y: ny });
    }
    function onPointerUp() {
      const s = state.current;
      if (s.dragging) {
        document.body.style.pointerEvents = '';
        document.body.style.userSelect = '';
      }
      s.down = false;
      s.dragging = false;
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  return (
    <div
      ref={panelRef}
      id={id}
      className={className}
      onPointerDown={onPointerDown}
      style={{
        ...style,
        position: 'fixed',
        left: pos.x + 'px',
        top: pos.y + 'px',
        zIndex: 200,
        cursor: 'default',
      }}
    >
      {children}
    </div>
  );
}
