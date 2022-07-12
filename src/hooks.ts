import { useEffect } from 'react';

export function useKeyPress(targetKey: string, callback: () => void) {
  useEffect(() => {
    // If pressed key is our target key then run callback
    function downHandler({ key }: KeyboardEvent): void {
      if (key === targetKey) {
        callback();
      }
    }

    // Add event listeners
    window.addEventListener('keydown', downHandler);

    // Remove event listeners on cleanup
    return () => {
      window.removeEventListener('keydown', downHandler);
    };
  }, [targetKey, callback]);
}
