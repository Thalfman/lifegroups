import type { CSSProperties } from "react";
import { P, fontSans } from "@/lib/pastoral";

// Shared pill-button style for the segmented toggles (the opinionated quick-view
// switcher and the Month/List view toggle). Both render the same rounded
// "active vs idle" pill, so the style is defined once to keep them identical.
export const pillButtonStyle = (active: boolean): CSSProperties => ({
  fontFamily: fontSans,
  fontSize: 12,
  fontWeight: active ? 700 : 500,
  color: active ? P.surface : P.ink3,
  background: active ? P.terra : "transparent",
  border: "none",
  padding: "8px 14px",
  cursor: "pointer",
  borderRadius: 999,
});
