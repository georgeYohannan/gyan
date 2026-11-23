import { useEffect, useRef, useState } from 'react';

/**
 * Hands back a value only once it has stopped changing for a moment.
 *
 * Home uses it for the search box: somebody typing "pricing" should cause one search, not seven.
 * The wait is 300 milliseconds, which is long enough to finish a word and short enough that the
 * list feels like it is keeping up.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);
  const first = useRef(true);

  useEffect(() => {
    // The value a screen opens with is already settled: useState above was given it. Waiting on
    // it would show an empty list for a third of a second on every load, including when the
    // address already carries a search.
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
