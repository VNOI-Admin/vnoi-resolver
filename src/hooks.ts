import { useEffect, useRef } from 'react';

/**
 * Subscribe to keydown for a key. Refs let callback/enabled change without
 * re-attaching the window listener.
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
    // Case-insensitive so caps-lock + Shift+letter still match.
    const target = targetKey.toLowerCase();
    function downHandler(e: KeyboardEvent): void {
      if (e.key.toLowerCase() !== target) return;
      if (!enabledRef.current) return;
      // Don't steal from focused form controls — otherwise the speed slider
      // would both move AND dispatch a step on arrow keys.
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
