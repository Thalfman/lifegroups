# Finalized Holistic Plan (No-Edit Review Output)

## P0 — Immediate (Reliability + Security Visibility)

1. **Establish baseline observability**
   - Add structured logging for critical server paths (auth/session/actions/edge functions).
   - Include: `event`, `route_or_action`, `actor_role`, `request_id`, `latency_ms`, `outcome`, `error_code`.
   - Replace ad hoc warn-only handling in critical auth flows with consistent structured events.

2. **Harden `getCurrentSession()` error behavior**
   - Remove throw-driven 500 behavior for transient Supabase read failures in session/profile/group assignment lookups.
   - Return controlled auth outcomes (redirect/login/unauthorized-safe state) instead of uncaught exceptions.
   - Add explicit error classification for: auth missing, profile missing, profile inactive, backend transient failure.

3. **Add rate limiting to forgot-password action**
   - Implement per-IP and per-email windowed limits (e.g., N per 15 min).
   - Keep generic user-facing response to avoid account discovery.
   - Log throttle events with anonymized identifiers (hash email in logs).

---

## P1 — Near-Term (Security Hardening + Regression Prevention)

4. **Mitigate timing side-channel in invite flow**
   - Normalize timing between “existing user” and “invite user” branches (or add bounded jitter).
   - Ensure response shape and status semantics remain consistent for equivalent outcomes.
   - Keep super-admin gate as defense-in-depth but do not rely on it exclusively.

5. **Reduce unsafe trust-boundary casts**
   - Replace unvalidated `as` casts at ingress boundaries with runtime-validated parsing.
   - Prioritize:
     - login profile read path
     - RPC wrapper call boundaries
   - Introduce narrow DTO validators and typed parse helpers.

6. **Introduce minimum test suite**
   - Add tests in three layers:
     - Unit: validators/parsers/role predicates.
     - Integration: auth/session gating + key action contracts.
     - E2E smoke: admin login + leader login + one protected route each.
   - Add CI gate requiring test pass before merge.

---

## P2 — Medium-Term (Maintainability + Scale Hygiene)

7. **Remove or formalize dead modules**
   - Confirm usage of placeholder modules (`lib/permissions`, `lib/health`, `lib/reports`).
   - Delete unused modules or implement clear ownership and purpose contracts.

8. **Refactor oversized components**
   - Split largest components into domain subcomponents/hooks/view-model layers.
   - Prioritize by LOC and churn:
     1) calendar shell
     2) check-in form
     3) groups directory
   - Target smaller files, clearer responsibilities, and easier testability.

9. **Constrain broad `select("*")` usage**
   - Phase A (higher risk): privacy-sensitive and high-traffic read paths.
   - Phase B: remaining read-model methods for payload minimization and schema-change resilience.
   - Define explicit selected column lists and shared constants for projection contracts.

10. **Validate session caching semantics**
   - Confirm `cache()` behavior is acceptable for within-request role/profile consistency.
   - Document expected semantics for role changes and refresh boundaries.
   - Add a regression test around role-change visibility expectations.

---

## Preserve These Strengths (Do Not Regress)

- SECURITY DEFINER RPC-centered write model.
- RLS-centered data access model.
- Service-role key kept out of app runtime code paths.
- Generic auth error responses that reduce enumeration risk.

---

## Delivery Cadence (Suggested)

- **Sprint 1:** P0 items 1–3 complete + smoke verification.
- **Sprint 2:** P1 items 4–6 complete + CI enforcement.
- **Sprint 3+:** P2 items 7–10 in parallel with feature delivery.

---

## Definition of Done (for this plan)

- P0/P1 items merged with tests and logging evidence.
- Incident triage possible from logs without reproducing locally.
- No uncaught auth/session transient failures causing user-facing 500s.
- Password-reset endpoint protected by measurable throttle policy.
- At least one automated test in each layer (unit/integration/e2e).
