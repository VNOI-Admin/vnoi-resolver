import { useEffect, useRef } from 'react';

/**
 * Subscribe to keydown for a key. Refs let callback/enabled change without
 * re-attaching the window listener.
 *
 * `opts.shift` / `opts.alt` gate on the Shift / Alt(⌥) modifiers: true
 * requires the modifier held, false requires it NOT held, undefined
 * (default) ignores it. If one binding of a key sets a modifier, any other
 * binding of the SAME key must set the opposite, or the undefined one
 * swallows both chords (the arrow keys: bare = step, Shift/⌥ = safe
 * margins).
 *
 * Meta/Ctrl chords never match: those belong to the browser (⌘T new tab,
 * ⌘/Alt+← history nav), and firing a show action underneath them was a
 * footgun. A matched binding also preventDefaults, so ⌥+← nudges a safe
 * margin instead of navigating Back (Windows/Linux) and Space on a focused
 * button doesn't double-fire via the button's own key activation.
 */
export function useKeyPress(
  targetKey: string,
  callback: () => void,
  enabled: boolean = true,
  opts?: { shift?: boolean; alt?: boolean }
) {
  const shift = opts?.shift;
  const alt = opts?.alt;
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
      if (e.metaKey || e.ctrlKey) return;
      if (shift !== undefined && e.shiftKey !== shift) return;
      if (alt !== undefined && e.altKey !== alt) return;
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
      e.preventDefault();
      cbRef.current();
    }
    window.addEventListener('keydown', downHandler);
    return () => window.removeEventListener('keydown', downHandler);
  }, [targetKey, shift, alt]);
}
