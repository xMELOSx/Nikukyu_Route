import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Transient save/load notification banner. Auto-dismisses after a delay.
 * The message is set with show(), which schedules its own cleanup — callers
 * do not need to remember to clear the timeout.
 */
export function useNotifications(defaultDurationMs: number = 2000) {
  const [message, setMessage] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number>(defaultDurationMs);
  const timerRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    setMessage(null);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback((msg: string, ms: number = defaultDurationMs) => {
    setDurationMs(ms);
    setMessage(msg);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setMessage(null);
      timerRef.current = null;
    }, ms);
  }, [defaultDurationMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { message, show, clear, durationMs } as const;
}
