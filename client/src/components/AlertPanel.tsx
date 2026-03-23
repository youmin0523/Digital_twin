import React, { useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

export default function AlertPanel() {
  const { state, dispatch } = useAppContext();

  const activeAlerts = state.alerts.filter((a) => !a.dismissed);

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    const timers = activeAlerts.map((alert) =>
      setTimeout(() => {
        dispatch({ type: 'DISMISS_ALERT', id: alert.id });
      }, 8000)
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAlerts.length]);

  if (activeAlerts.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[520px] max-w-[90vw]">
      {activeAlerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-2xl backdrop-blur-md text-sm
            ${alert.severity === 'critical'
              ? 'bg-red-900/90 border border-red-400 text-red-100'
              : 'bg-yellow-900/90 border border-yellow-400 text-yellow-100'
            }`}
        >
          <span className="text-xl mt-0.5 shrink-0">
            {alert.severity === 'critical' ? '🚨' : '⚠️'}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{alert.vesselName}</div>
            <div className="text-xs opacity-90 mt-0.5">{alert.message}</div>
          </div>
          <button
            className="text-white/60 hover:text-white shrink-0 ml-2 text-lg leading-none"
            onClick={() => dispatch({ type: 'DISMISS_ALERT', id: alert.id })}
            title="닫기"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
  // TEST
}
