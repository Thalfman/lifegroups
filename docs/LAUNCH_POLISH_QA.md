# Phase 5A.0.1 — Launch polish QA checklist

This is a manual smoke test for the launch-polish PR. It verifies that
copy, accessibility, and responsive polish landed cleanly and that no
write workflows, RLS policies, or service-role usage was accidentally
introduced.

## 1. Public surfaces (no Supabase env vars required)

- [ ] `/` renders with no console errors.
- [ ] The header no longer shows a "Phase 4" chip on the home, admin
      preview, or leader preview pages.
- [ ] When signed out, the home page shows "Sign in to see live data
      scoped to your role…" copy and offers the **Sign in**, **Admin
      design preview**, and **Leader design preview** buttons.
- [ ] `/admin-preview` renders the admin dashboard from fallback data.
      The `DataSourceBadge` shows **Demo Data**.
- [ ] `/leader-preview` renders the leader workflow from fallback data.
      The `DataSourceBadge` shows **Demo Data**.
- [ ] With Supabase env vars completely unset, the previews still render
      without errors (they call `getAdminDashboardData(null)` and
      `getLeaderDashboardData(null, …)`).

## 2. Protected surfaces

- [ ] Without a session, visiting `/admin`, `/admin/people`, `/leader`,
      or `/staff` redirects to `/login`.
- [ ] After signing in as a non-admin profile, visiting `/admin` or
      `/admin/people` redirects via `requireAdmin` to `/unauthorized`.
- [ ] `/admin/people` loads only for `super_admin` or `ministry_admin`.
      The page header still labels itself **Phase 5A.0** (this surface
      is intentionally pre-launch scaffold for admins).
- [ ] Every action card on `/admin/people` shows a disabled button
      labelled "Coming in Phase 5A.1" and a `title` tooltip that names
      the gate copy. Clicking them does nothing.
- [ ] The phase gate notice on `/admin/people` clearly splits Phase 5A.1
      (admin people/role writes) from Phase 5B (operational writes).

## 3. Navigation and shell polish

- [ ] On every page, the sidebar nav highlights the currently active
      route (visible left border + filled background on desktop, pill
      treatment on mobile). The active link has `aria-current="page"`.
- [ ] At a viewport width of 375 px, the sidebar collapses into a
      horizontal scrollable pill row at the top of the page (not a
      stacked desktop sidebar).
- [ ] At 768 px (tablet) and 1280 px (desktop), the sidebar appears as
      a 240 px column on the left with `aria-current` styling.
- [ ] A "Skip to content" link appears at the top-left when focused via
      keyboard and lands on the `<main id="main">` landmark.
- [ ] Keyboard tab order through the nav, header buttons, and disabled
      action buttons is sensible. The focus ring is visible on every
      interactive element.

## 4. Dashboard accessibility

- [ ] The capacity bar on `/admin` (and `/admin-preview`, `/staff`)
      exposes a `role="img"` with a descriptive `aria-label` summarizing
      members and percentage utilization.
- [ ] The guest pipeline bar exposes a `role="img"` with an `aria-label`
      naming the total guest count and the largest stage.
- [ ] Empty states on the admin dashboard render through the shared
      `EmptyState` component (consistent visual weight across the page).

## 5. Phase copy consistency

- [ ] No user-facing TSX file under `app/` or `components/` mentions
      "Phase 4". Verify with:
      ```
      rg -n "Phase 4" app components
      ```
- [ ] No user-facing TSX mentions a bare "Phase 5" — only "Phase 5A.1"
      or "Phase 5B". Verify with:
      ```
      rg -n 'Phase 5"[^A-Z]|Phase 5 ' app components
      ```
- [ ] `docs/DEPLOYMENT.md` now leads with "Current (Phase 5A.0.1 —
      launch polish, read-only)" and the "What lands next" section
      splits Phase 5A.1 vs Phase 5B explicitly.

## 6. Server-action stubs are still throwing

- [ ] `app/(protected)/admin/people/actions.ts` has no Supabase import.
- [ ] Each of the eight stubs (`adminCreateMinistryAdmin`,
      `adminCreateLeaderProfile`, `adminCreateMember`,
      `adminAssignLeaderToGroup`, `adminAssignMemberToGroup`,
      `adminDeactivateProfile`, `adminDeactivateMember`,
      `adminChangeUserRole`) immediately throws
      `"Phase 5A.1 required: write policies and server actions are not
      enabled yet."`
- [ ] No form on `/admin/people` is wired to any of those stubs.

## 7. Static checks

Run all three from the repo root:

```
npm run lint
npm run typecheck
npm run build
```

All three must pass cleanly.

## 8. Boundary verification (must all be clean)

```
rg -n "service_role|SUPABASE_SERVICE" app lib components
rg -n "from \"@/lib/supabase" app/\(protected\)/admin/people
git diff --stat origin/main -- supabase
```

Expected:

- The first command may surface only docs / dev-script mentions; no app
  code under `app/`, `lib/`, or `components/` should reference a
  service-role key.
- The second command must return no results — `app/(protected)/admin/people`
  must not import from `@/lib/supabase` anywhere.
- The third command must report **no changes** under `supabase/`.
