import React, { useEffect, useState, useRef } from 'react';
import { ICEBREAKER_META } from '../../services/voyageTrace';

const EVENT_STYLE = {
  call: { tag: '[CALL]', color: '#facc15' },
  rendezvous: { tag: '[RDV]', color: '#fb923c' },
  start_escort: { tag: '[ESCORT]', color: '#ef4444' },
  release: { tag: '[RELEASE]', color: '#3b82f6' },
  return: { tag: '[RETURN]', color: '#9ca3af' },
  intercept_failed: { tag: '[FAIL]', color: '#b91c1c' },
  arrive: { tag: '[ARRIVE]', color: '#4ade80' },
};

function fmtEvent(ev) {
  const style = EVENT_STYLE[ev.type] || { tag: `[${ev.type}]`, color: '#fff' };
  const name = ICEBREAKER_META[ev.icebreaker_id]
    ? ICEBREAKER_META[ev.icebreaker_id].name_ko
    : ev.icebreaker_id;
  return { ...style, name, t: ev.t, type: ev.type };
}

export default function VoyageEventToast({ newEvents }) {
  const [toasts, setToasts] = useState([]);
  const [log, setLog] = useState([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (!newEvents || newEvents.length === 0) return;
    const added = [];
    for (const ev of newEvents) {
      idRef.current += 1;
      const item = { ...fmtEvent(ev), uid: idRef.current };
      added.push(item);
      // eslint-disable-next-line no-console
      console.log(
        `[VoyagePlayback] ${item.tag} t=${item.t.toFixed(1)}h ${item.name}`,
      );
    }
    setToasts((prev) => [...prev, ...added]);
    setLog((prev) => [...added.slice().reverse(), ...prev].slice(0, 50));

    // 3초 후 자동 제거
    const timers = added.map((item) =>
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.uid !== item.uid));
      }, 3000),
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [newEvents]);

  return (
    <>
      <div className="voyage-toast-stack">
        {toasts.map((t) => (
          <div
            key={t.uid}
            className={`voyage-toast ${t.type === 'intercept_failed' ? 'emph' : ''}`}
            style={{ borderLeftColor: t.color }}
          >
            <span className="voyage-toast-tag" style={{ color: t.color }}>
              {t.tag}
            </span>
            <span className="voyage-toast-msg">
              t={t.t.toFixed(1)}h {t.name}
            </span>
          </div>
        ))}
      </div>
      {/* Event log 패널 — 임시 렌더링 차단 (WeatherHud/Minimap 영역 침범 이슈) */}
      {false && (
        <div className="voyage-event-log">
          <div className="voyage-event-log-title">Event log</div>
          <div className="voyage-event-log-list">
            {log.length === 0 ? (
              <div className="muted">(no events yet)</div>
            ) : (
              log.map((t) => (
                <div key={t.uid} className="voyage-event-log-item">
                  <span style={{ color: t.color }}>{t.tag}</span>
                  <span>
                    {' '}
                    t={t.t.toFixed(1)}h {t.name}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
