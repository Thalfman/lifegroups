# Data inventory & processor disclosure

Status: Living document — keep accurate to the code and schema
Owner: Tom
Last updated: 2026-06-14
Phase: Mobile store roadmap Phase 3 (see [`docs/MOBILE_STORE_ROADMAP.md`](../MOBILE_STORE_ROADMAP.md))

This document enumerates the data categories LifeGroups collects and the
processors that receive them, derived from the actual code and schema. It feeds
the public privacy policy page and the Apple/Google data-safety forms, so it
must stay accurate and **avoid overclaiming**. When the data model changes,
update this file in the same change.

LifeGroups is an **invite-only, role-based ministry operations app** for Fox
Valley Church staff, Over-Shepherds, and Life Group Leaders. **Members do not
log in** — they are non-auth records that ministry staff maintain on their
behalf. There is no public sign-up and no public member-facing browsing.

## 1. Data categories collected

Each category maps to where it lives in the schema (`types/database.ts` +
`supabase/migrations/`). "Subjects" names whose data it is.

| Category                        | Fields                                                                                                        | Subjects                                               | Where it lives                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Account identity**            | full name, email, phone (optional), role, status                                                              | App users (staff, Over-Shepherds, Leaders, Co-Leaders) | `profiles`                                                                                                      |
| **Authentication**              | email, password (hashed), session cookies, auth user id                                                       | App users                                              | Supabase Auth (`auth.users`); `profiles.auth_user_id` links to it                                               |
| **Member records**              | full name, email (optional), phone (optional), household name, care-sensitivity flag                          | Group members (non-auth)                               | `members`                                                                                                       |
| **Group data**                  | group name, meeting day/time/location, capacity, lifecycle & health status, audience × category (cell), notes | Groups                                                 | `groups`, `group_leaders`, `group_memberships`, `group_categories`, `category_type_targets`                     |
| **Attendance**                  | per-meeting attendance status, session notes                                                                  | Members in a group                                     | `attendance_sessions`, `attendance_records`                                                                     |
| **Group health**                | pulse/health updates, rubric grades, assessments                                                              | Groups & Leaders                                       | `group_health_updates`, `group_health_assessments`, `group_rubric_grades`, `leader_rubric_grades`               |
| **Interest Funnel (Prospects)** | name, email (optional), phone (optional), funnel state, notes, desired cell                                   | Prospective members                                    | `prospects` (supersedes the frozen `guests`)                                                                    |
| **Care Notes**                  | free-text pastoral observations                                                                               | Leaders / groups (subjects)                            | `care_notes` (author-private until a per-subject transparency grant)                                            |
| **Prayer Requests**             | free-text prayer items, status                                                                                | Leaders / groups (subjects)                            | `prayer_requests`                                                                                               |
| **Shepherd care**               | care status, contact cadence, interaction logs, admin summaries                                               | Leaders being shepherded                               | `shepherd_care_profiles`, `shepherd_care_interactions`, `shepherd_care_follow_ups`, `shepherd_care_admin_notes` |
| **Private care notes**          | AES-256-GCM ciphertext (zero-knowledge; the server never holds plaintext or the key)                          | Leaders being shepherded                               | `shepherd_care_private_notes`, `shepherd_care_note_key_slots`                                                   |
| **Coverage**                    | which Over-Shepherd covers which Leader                                                                       | Over-Shepherds ↔ Leaders                               | `over_shepherds`, `shepherd_coverage_assignments`                                                               |
| **Audit trail**                 | actor, action, entity type/id, structured metadata (no free-text bodies), denormalized actor name/email       | App users (as actors)                                  | `audit_events`, `audit_events_archive`                                                                          |
| **Usage telemetry**             | coarse event type (`login` / `area_view`) and area slug                                                       | App users                                              | `usage_events` (Super-Admin only; written **only** while the `usage_tracking` flag is on)                       |
| **Account-deletion requests**   | requesting profile id, optional reason, status                                                                | App users                                              | `account_deletion_requests` (self-service request → admin-reviewed purge)                                       |

Notes:

- **Sensitive content** (Care Notes, Prayer Requests, shepherd-care notes) is
  pastoral and is fenced by Row Level Security and the visibility ladder
  (Super Admin ▸ Ministry Admin ▸ Over-Shepherd ▸ Leader), with two deliberate
  exceptions: the Ministry Admin's Private Care Note (hidden even from the Super
  Admin) and author-private Care Notes (sealed to their author until a
  per-subject transparency grant is flipped).
- **No special-category data is solicited by design** beyond what a leader may
  voluntarily write into a free-text Care Note / Prayer Request. The app does
  not collect health, biometric, financial, precise-location, or advertising
  identifiers.

## 2. Processors / sub-processors

| Processor                                                                         | What it receives                                                                                        | Purpose                                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Supabase** (Postgres + Auth + Edge Functions, EU/US region per project)         | All database categories above; authentication credentials; transactional auth email delivery            | Primary data store, authentication, Row Level Security, server-side write RPCs |
| **Vercel** (hosting)                                                              | HTTP request metadata to serve the app                                                                  | Application hosting / runtime                                                  |
| **Vercel Analytics** (`@vercel/analytics`)                                        | Aggregate, anonymous page-view / web-vitals signals                                                     | Product analytics (no advertising, no cross-site tracking)                     |
| **Vercel Speed Insights** (`@vercel/speed-insights`)                              | Aggregate, anonymous performance metrics                                                                | Real-user performance monitoring                                               |
| **Upstash Redis** (`@upstash/ratelimit`)                                          | A hashed rate-limit key derived from request IP and the submitted email on the forgot-password endpoint | Abuse / enumeration rate limiting (fails open; disabled when unconfigured)     |
| **Email delivery** (Supabase Auth, plus any SMTP provider configured in Supabase) | Recipient email address for invite / password-reset messages                                            | Transactional auth email only                                                  |

The service-role key that can bypass RLS is confined to Supabase Edge Functions
(`invite-user`, `manage-test-auth-users`, `redeem-invite`) — it is **never**
present in the Next.js runtime.

## 3. Device permissions & notifications

- **No device permissions are requested.** The app does not access the camera,
  microphone, contacts, calendar, precise location, photos, or files.
- **No push notifications.** None are configured today (roadmap §10 keeps push
  out of the first store submission); the app requests no notification
  permission.
- **No advertising / no third-party ad SDKs / no cross-app tracking.**

## 4. Data lifecycle

- **Archive, not delete.** The default way anything leaves a surface is a
  reversible soft delete (`archived_at` / status flags). No hard deletes in
  normal workflows.
- **Account deletion.** A signed-in user can request deletion from their account
  area (see #563). On request, app access is revoked immediately and the profile
  is archived; the permanent purge (with a tombstone) is a Super-Admin
  danger-zone action. Care Notes and Prayer Requests the person authored are
  retained as ministry continuity — deletion targets the person's account and
  personal profile data, not the group's care history.
- **Audit retention.** Mutations write a paired `audit_events` row in the same
  transaction; audit reset/wipe is a Super-Admin-only operation that snapshots
  to an archive table first.

## 5. Store-form readiness

This inventory is intended to be sufficient to complete the Apple App Privacy
and Google Play Data safety forms **without guessing**:

- **Data linked to the user:** name, email, phone (optional), and the ministry
  records above are linked to an identified app user / member.
- **Data used for tracking:** none.
- **Data used for advertising:** none.
- **Account creation:** invite-only / admin-provisioned; no public sign-up.
- **Account deletion:** in-app deletion request + a public deletion page (#562 /
  #563).

If a store form asks a question this document does not answer, treat that as a
gap to resolve here first rather than guessing on the form.
