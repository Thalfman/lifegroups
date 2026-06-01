"use client";

import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` of
 * quiet — useful for search inputs that drive an expensive filter/sort. The
 * input itself stays controlled by the caller's immediate state (so typing
 * feels instant), while the heavy derived work keys off the settled value and
 * runs at most once per pause instead of once per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
