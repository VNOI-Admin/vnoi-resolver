import { useEffect, useRef } from 'react';

/**
 * Subscribe a callback to keydown events for a specific key. The callback is
 * stored in a ref so it can change between renders without re-attaching the
 * window listener.
 *
 * When `enabled` is false the handler is suppressed but the listener stays
 * attached — toggling `enabled` won't churn the window listener either.
 */
export function useKeyPress(
  targetKey: string,
  callback: () => void,
  enabled: boolean = true
) {
  const cbRef = useRef(callback);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    function downHandler(e: KeyboardEvent): void {
      if (e.key !== targetKey) return;
      if (!enabledRef.current) return;
      cbRef.current();
    }
    window.addEventListener('keydown', downHandler);
    return () => window.removeEventListener('keydown', downHandler);
  }, [targetKey]);
}
