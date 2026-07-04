// The shared URL-write for tab shells that mirror their active tab into
// `?tab=` (People, Person detail, Multiply). replaceState (not push) so tab
// flips don't pollute history; callers own their scheduling — sync in a click
// handler, or deferred in an effect where INP matters.
export function replaceTabParam(
  pathname: string,
  search: string,
  tab: string
): void {
  const params = new URLSearchParams(search);
  params.set("tab", tab);
  window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
}
