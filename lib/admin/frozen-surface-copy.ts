// Canonical user-facing explainer for an ADR-0002 frozen surface (#191 / ADR
// 0009). Lives here as a pure string so every presentation of the freeze — the
// full-page FrozenSurfaceNotice and the dashboard FrozenStatusCard — tells
// admins the same story and can't drift. It reads as deliberately frozen, with
// the path back, never as broken.
export const FROZEN_SURFACE_EXPLAINER =
  "This surface is deferred per ADR 0002 and is turned off by default. A " +
  "Super Admin can re-enable it from the Super Admin Console once its routes " +
  "and access policies have been re-verified (ADR 0009). It is intentionally " +
  "frozen, not broken.";
