// Scroll a URL fragment target into view once it exists in the DOM.
//
// Surfaces that render their content through `next/dynamic` (ssr:false) — the
// Multiply panels, the Super-Admin workspaces — have only a loading skeleton in
// the initial HTML, so the element a deep link names (e.g. `#seg-…`,
// `#people-import`) is absent when the browser performs its native fragment
// scroll and again a frame or two later. A fixed double-rAF therefore misses it
// and the deep link lands at the top of the panel.
//
// This polls on each animation frame until the target element appears (or a
// short deadline passes), then scrolls to it — restoring land-on-the-section
// behaviour without keeping the heavy panels server-rendered. Returns a cancel
// function so callers can abort on unmount or before starting a newer scroll
// (e.g. a second hashchange). Client-only: it touches window/document.
export function scrollToHashTarget(
  id: string,
  options: {
    behavior?: ScrollBehavior;
    block?: ScrollLogicalPosition;
    timeoutMs?: number;
  } = {}
): () => void {
  const { behavior = "auto", block = "start", timeoutMs = 3000 } = options;
  if (typeof window === "undefined" || !id) return () => {};

  let frame = 0;
  let cancelled = false;
  const deadline = performance.now() + timeoutMs;

  const tick = () => {
    if (cancelled) return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ block, behavior });
      return;
    }
    if (performance.now() >= deadline) return;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}
