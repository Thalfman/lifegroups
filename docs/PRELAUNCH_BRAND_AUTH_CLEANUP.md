# Prelaunch brand, auth, and cleanup

This document captures the finish-line cleanup pass that brought the app
to its launch-ready shape for Julian, ministry admins, and Life Group
leaders. It is intended as a launch checklist, not a redesign log — the
underlying feature surfaces (admin dashboard, group schedule
intelligence, settings reset, guest pipeline, follow-ups, super-admin
audit/role console) were already complete before this pass.

---

## 1. App name and brand

The visible app name is **Fox Valley Church Life Groups** everywhere a
user can see it:

- Metadata title (`app/layout.tsx`)
- Public landing header (`app/page.tsx`)
- Login sidebar (`app/login/page.tsx`)
- Forgot-password and reset-password headers
- Unauthorized header (`app/unauthorized/page.tsx`)
- Protected shell wordmark (`components/pastoral/shell.tsx`)

The accompanying `PSeal` (FVC mark) is unchanged.

## 2. Typography

The app uses **Inter only**. We removed `Fraunces`, `Newsreader`, and
`JetBrains_Mono` from the font stack. The CSS variables in
`app/globals.css` all resolve to Inter:

```css
--font-sans: var(--font-inter), system-ui, sans-serif;
--font-display: var(--font-inter), system-ui, sans-serif;
--font-body: var(--font-inter), system-ui, sans-serif;
--font-mono: ui-monospace, "SF Mono", Menlo, monospace;
```

Inter is loaded through `next/font` with `display: swap`, so there is no
external font-loading layout shift. The previous serif wordmark (whose
italic "F" looked messy in the top-left) is gone.

## 3. Demo / preview surfaces

The `/admin-preview` and `/leader-preview` routes have been **deleted
from the launched product**. The public landing page (`app/page.tsx`)
was simplified to a minimal sign-in landing — no "See a demo" CTAs, no
feature tour, no preview navigation. The login page footer no longer
links to preview surfaces.

The `PublicPreviewNotice` component was removed (it had no remaining
callers). Fallback demo data still exists in `lib/dashboard/queries.ts`
for the case where Supabase is not configured in development; that
fallback never reaches a launched product workflow.

## 4. Staff View elimination

The Staff View product surface has been **eliminated from the user
experience**. Specifically:

- `ROLE_LABELS.staff_viewer` now reads "Legacy (no access)" — any stray
  audit-event row or profile lookup shows the legacy label, not "Staff
  Viewer".
- `StaffViewDeprecatedNote` (the card on `/admin/super-admin`) and the
  `staff_view_deprecated` status checklist row are both removed.
- The unused `requireAdminOrStaff()` helper and
  `isAdminOrStaffRole()` / `ADMIN_OR_STAFF_ROLES` exports are
  deleted from `lib/auth/session.ts` and `lib/auth/roles.ts`.
- `defaultLandingPathForRole("staff_viewer")` still routes to
  `/unauthorized` — historical accounts cannot reach the admin or
  leader surfaces.

**Database compatibility is intentionally retained.** `staff_viewer`
remains in the `user_role` Postgres enum, in the `types/enums.ts`
union, in the seed data (`jordan.hayes@example.org`), and in the RLS
helper `auth_is_staff_viewer()`. The validator in
`lib/admin/validation.ts` continues to reject any attempt to assign
`staff_viewer` from the app as defense in depth.

## 5. Invite-only signup

There is **no public signup page**. Account creation works as follows:

1. A ministry admin creates the profile through the existing
   role-controlled admin tools (`/admin/people` → "Add leader / member"
   forms), which go through the Phase 5A.4 RPC.
2. When the user receives their Supabase Auth credentials and signs in,
   `loginAction` looks up the linked profile by `auth_user_id` and
   routes them to `defaultLandingPathForRole(role)`.
3. If a user authenticates without a linked profile, they land on
   `/unauthorized` with the message "Your sign-in worked, but your
   account isn't linked to a ministry profile yet. Ask a ministry admin
   to invite you."
4. No auth path automatically grants `super_admin`, `ministry_admin`,
   `leader`, or `co_leader` access.
5. **Members are non-login participant records** and never sign in.

The login page footer now reads: "Not a user yet? Ask a ministry admin
to invite you."

## 6. Password reset

Two new routes ship with this pass:

### `/forgot-password`

- `app/forgot-password/page.tsx` + `forgot-password-form.tsx`
- Server action: `app/forgot-password/actions.ts`
- Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo })`
- **Always returns the same generic success state** — the form cannot be
  used to discover which emails are registered.
- The success message reads: "If an account exists for that email, a
  reset link has been sent."
- Configuration / Supabase errors are logged server-side but never
  surfaced.

### `/reset-password`

- `app/reset-password/page.tsx` + `reset-password-form.tsx`
- Server action: `app/reset-password/actions.ts`
- The page handles the Supabase PKCE recovery flow via
  `client.auth.exchangeCodeForSession(code)`, then renders the form.
- Validates: both passwords present, min length 8, passwords match.
- Calls `supabase.auth.updateUser({ password })`.
- On success, signs out the local recovery session and redirects to
  `/login?reset=ok`, where the login page shows a small banner:
  "Password updated. Sign in."
- On failure, returns the Supabase error message (sanitized).

### Required environment variable

```
NEXT_PUBLIC_SITE_URL=https://your-production-domain
```

If unset, password-reset emails will not include a valid `redirectTo`
and the recovery link in the email will land on Supabase's default
target instead of `/reset-password`. The forgot-password form still
returns the generic success state.

### Required Supabase Auth dashboard settings

In the Supabase project for this app, set:

| Setting | Value |
| --- | --- |
| **Site URL** | `https://<production-domain>` |
| **Additional Redirect URLs** | `https://<production-domain>/reset-password`, `https://<production-domain>/login` |
| **Reset password email template `{{ .ConfirmationURL }}`** | Should resolve to `{{ .SiteURL }}/reset-password?code=...` (this is the default; ensure no custom template overrides it). |
| **Email confirmations** | Enable per ministry preference. Invited users created through the admin flow can either confirm via Supabase email or be set as confirmed by the admin. |

## 7. Copy

User-visible copy across protected routes was rewritten to drop:

- Internal "Phase 5X.Y" eyebrows (e.g., "Phase 5B.1 · Check-ins")
- Decorative two-line italic titles like "The stewardship queue, *kept in
  one place.*"
- The "Ministry command center" eyebrow on `/admin`

In their place: short, calm, operator-facing labels (`Check-ins`,
`Follow-ups`, `Guests`, `People`, `Settings`, `Super admin`,
`Groups`, `This week`).

Mission language appears lightly in three places:

| Surface | Copy |
| --- | --- |
| `/login` sidebar | "Supporting Life Groups as they care for people and build meaningful relationships." |
| `/admin` dashboard lede | "Supporting Life Groups as they tell and show the story of Jesus. See what needs attention this week." |
| `/leader` dashboard lede | "Help your group stay connected. Submit this week's check-in and follow up well." |

The public landing `app/page.tsx` carries the same mission tagline above
the single sign-in button. We deliberately avoided "command center,"
"unlock," "supercharge," "powerful insights," "shepherding dashboard,"
"crush," "revolutionize," and similar SaaS-marketing language.

## 8. Admin dashboard shape (unchanged)

`/admin` remains a high-level operational overview, not a long
operations page. It surfaces:

1. Capacity, health, and setup-gap summary cards
2. A weekly attention list
3. Drill-down cards that link to `/admin/groups`, `/admin/check-ins`,
   `/admin/guests`, `/admin/follow-ups`, and `/admin/settings`

This cleanup pass did not change the dashboard shape; only the eyebrow,
title, and lede were rewritten.

## 9. Group schedule fields and check-in due dates (unchanged)

- `meeting_day` (Sunday–Saturday dropdown), `meeting_frequency`
  (weekly / bi-weekly / monthly), and `meeting_week_parity` (odd / even,
  shown only for bi-weekly) are managed in
  `components/admin/forms/group-edit-form.tsx`.
- Edit buttons read "Save changes" / "Cancel". The lifecycle action is
  "Archive group" and is visually separate.
- Check-in due dates are computed by the shared helper
  `lib/admin/check-in-due.ts:computeCheckInDue()` from
  `meeting_day` + `meeting_time` + offset. Default offset is **24 hours**
  after the scheduled meeting time. The same helper is consumed by
  admin (`lib/dashboard/queries.ts`) and leader
  (`app/(protected)/leader/[groupId]/checkin/page.tsx`) surfaces.
- OFF and Cancelled calendar occurrences suppress the check-in due for
  that week (per `lib/admin/check-in-due.ts:422-437`).
- Meeting time is owned by group management. The calendar editor does
  **not** expose `start_time`, `end_time`, `meeting_day`,
  `meeting_frequency`, or `meeting_week_parity` fields.

## 10. Settings reset (unchanged)

- `/admin/settings` exposes "Reset defaults" via
  `components/admin/forms/reset-metric-defaults-button.tsx`.
- A `window.confirm` step blocks immediate execution.
- The server action `adminResetMetricDefaults` calls the
  `admin_reset_metric_defaults()` RPC.
- The RPC restores the baseline metric defaults and writes an
  `audit_events` row in the **same transaction**.
- Per-group overrides in `group_metric_settings` are **not touched**.
- The audit entry renders in `/admin/super-admin`.

## 11. Privacy and security boundaries

- No service-role usage exists in app code; greps confirm zero hits.
- All writes go through SECURITY DEFINER RPCs; no direct
  `.update()` / `.upsert()` / `.delete()` calls in `app/`, `components/`,
  or `lib/`.
- Every write RPC pairs with an `audit_events` insert in the same
  transaction (Phases 5A.1 through 5C.0).
- `admin_private_note` is omitted from `LEADER_FOLLOW_UP_COLUMNS` in
  `lib/supabase/read-models.ts`, and the `LeaderFollowUpRow` type
  Omits it at compile time. Leader pages never read, render, or
  serialize the field.
- Audit log reads are restricted to `super_admin` via RLS.

## 12. Known limitations

- This cleanup did not exercise the email send portion of the
  password-reset flow end-to-end against a live Supabase project; the
  flow's code-side behavior is verified, but the operator must confirm
  the Supabase dashboard settings listed above before launch.
- `staff_viewer` remains in the database enum; if a future migration
  removes it, the validator block in `lib/admin/validation.ts` can also
  be removed.
- The repo has no automated test suite; verification is via
  `npm run lint`, `npm run typecheck`, `npm run build`, and the manual
  smoke checklist in this document and the prelaunch task brief.
