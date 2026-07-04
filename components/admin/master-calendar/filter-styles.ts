// Shared pill-button classes for the segmented toggles (the opinionated
// quick-view switcher and the Month/List view toggle). Both render the same
// rounded "active vs idle" pill, so the classes are defined once to keep them
// identical.
export const pillButtonClassName = (active: boolean): string =>
  active
    ? "cursor-pointer rounded-pill border-none bg-clay px-3.5 py-2 font-sans text-xs font-bold text-surface"
    : "cursor-pointer rounded-pill border-none bg-transparent px-3.5 py-2 font-sans text-xs font-medium text-ink3";
