import { useState } from "react";

/**
 * Run `onChange` during render the first time `value` differs (by identity)
 * from the previous render's value — React's recommended replacement for a
 * `setState`-in-effect when the work is purely deriving or resetting state that
 * the calling component owns (the "adjusting some state when a prop changes"
 * pattern: https://react.dev/learn/you-might-not-need-an-effect).
 *
 * Because `onChange` runs synchronously during render (before the browser sees
 * the in-progress paint), the state it schedules is applied without an extra
 * commit or a visible flash — unlike an effect, which fires after commit and
 * triggers the cascading re-render the `react-hooks/set-state-in-effect` rule
 * warns about. The trade-off: `onChange` must ONLY update state local to this
 * component. Parent callbacks and DOM/external-system work belong in an effect.
 *
 * `value` is typically an action result object (whose identity changes per
 * submission) or a prop the local state should track.
 */
export function useValueChange<V>(
  value: V,
  onChange: (value: V, previous: V) => void
): void {
  const [previous, setPrevious] = useState(value);
  if (!Object.is(value, previous)) {
    setPrevious(value);
    onChange(value, previous);
  }
}
