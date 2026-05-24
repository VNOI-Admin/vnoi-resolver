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
    // Case-insensitive compare so caps lock (and Shift+letter) still match.
    // No-op for non-letter keys (ArrowLeft / ' ' / digits etc.).
    const target = targetKey.toLowerCase();
    function downHandler(e: KeyboardEvent): void {
      if (e.key.toLowerCase() !== target) return;
      if (!enabledRef.current) return;
      // Don't steal keys from a focused form control — otherwise focusing the
      // speed slider and pressing arrow keys both adjusts the slider AND
      // dispatches a step. Same hazard for digits in number inputs.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      cbRef.current();
    }
    window.addEventListener('keydown', downHandler);
    return () => window.removeEventListener('keydown', downHandler);
  }, [targetKey]);
}
