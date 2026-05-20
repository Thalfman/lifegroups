import type { CSSProperties } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";

export const fieldLabelStyle: CSSProperties = {
  display: "block",
  fontFamily: fontSans,
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: P.ink3,
  fontWeight: 600,
  marginBottom: 6,
};

export const fieldInputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${P.line}`,
  background: P.surface,
  fontFamily: fontBody,
  fontSize: 14,
  color: P.ink,
  outline: "none",
  lineHeight: 1.4,
};

export const fieldSelectStyle: CSSProperties = {
  ...fieldInputStyle,
  appearance: "auto",
  background: P.surface,
};

export const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
  alignItems: "end",
};

// Apply alongside `style={formGridStyle}` to collapse to a single column at
// ≤767px. (CSS in app/globals.css overrides the inline gridTemplateColumns
// with !important inside the mobile media query.)
export const formGridMobileClass = "lg-m-grid-stack";

// Apply on form inputs/textareas/selects to widen tap targets and set the
// font-size to 16px so iOS doesn't auto-zoom on focus.
export const fieldInputClass = "lg-m-input";

export const formNoteStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink2,
  margin: "0 0 12px",
  lineHeight: 1.5,
};

export const errorTextStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 13,
  color: "#923220",
  background: P.terraSoft,
  padding: "8px 12px",
  borderRadius: 6,
  margin: 0,
};

export const successTextStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 13,
  color: "#3e4f29",
  background: P.sageSoft,
  padding: "8px 12px",
  borderRadius: 6,
  margin: 0,
};
