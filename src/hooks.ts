import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

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

export function useStateWithRollback<T>(
  initialState: T | (() => T)
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [history, setHistory] = useState<T[]>(() => {
    if (initialState instanceof Function) {
      return [initialState()];
    } else {
      return [initialState];
    }
  });

  const state = useMemo(() => history[history.length - 1], [history]);

  const setState: Dispatch<SetStateAction<T>> = useCallback(
    (value: SetStateAction<T>) => {
      if (value instanceof Function) {
        setHistory((history) =>
          history.concat(value(history[history.length - 1]))
        );
      } else {
        setHistory((history) => history.concat([value]));
      }
    },
    []
  );

  const rollback = useCallback(() => {
    setHistory((history) => {
      return history.length > 1 ? history.slice(0, -1) : history;
    });
  }, []);

  return [state, setState, rollback];
}
