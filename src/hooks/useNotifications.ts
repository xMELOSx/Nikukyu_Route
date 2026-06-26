import { useState, useCallback } from 'react';

/**
 * Transient save/load notification banner. Auto-dismisses after a delay.
 * The message is set with show(), which schedules its own cleanup — callers
 * do not need to remember to clear the timeout.
 */
export function useNotifications(defaultDurationMs: number = 2000) {
  const [message, setMessage] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number>(defaultDurationMs);

  const show = useCallback((msg: string, ms: number = defaultDurationMs) => {
    setDurationMs(ms);
    setMessage(msg);
  }, [defaultDurationMs]);

  const clear = useCallback(() => {
    setMessage(null);
  }, []);

  return { message, show, clear, durationMs } as const;
}
