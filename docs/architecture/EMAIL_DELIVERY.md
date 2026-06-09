# Email delivery (invites + password reset)

All user-facing email in this app is sent by **Supabase Auth**: the super-admin
"Invite user" flow (`supabase/functions/invite-user`) and the forgot/reset
password flow. There is no separate transactional-email service in the codebase.

## Why invites "send" but never arrive

Supabase's **default/built-in email sender is test-only**. It is heavily
rate-limited (a few messages per hour) and is not intended to deliver to
arbitrary recipients — messages to real invitees are silently dropped or
deferred. The Edge Function still returns success (HTTP 200) because Supabase
_accepted_ the request; the mail just never goes out.

**To deliver invite and reset emails reliably you must configure a custom SMTP
provider in the Supabase dashboard.** This is dashboard configuration, not code.

> Until SMTP is configured, onboarding still works: the per-person "Invite user"
> card's **"Copy invite link"** button returns a copyable setup link — for both
> brand-new people and those already on the roster with no login yet — that the
> admin can paste into their own email/text. (Existing logins get no link: they
> sign in or use Forgot password, which sends to their own mailbox.) The
> shareable invite link does not depend on email at all.

## One-time setup (Supabase dashboard → project `Fvclifegroups`)

### 1. Email templates — Authentication → Email Templates

- **Invite user** → paste the contents of `supabase/templates/invite.html`.
- **Reset Password** → paste the contents of `supabase/templates/recovery.html`.

Both templates deliberately use `{{ .TokenHash }}` and link to
`/reset-password?token_hash=…&type=…` (not the default `{{ .ConfirmationURL }}`),
so a mail-scanner's GET can't burn the single-use token and verification works
cross-device. Keep them in sync with the files in `supabase/templates/`.

> **Link host is pinned.** Both templates hard-code the public origin
> `https://fvclifegroups.vercel.app` instead of `{{ .SiteURL }}`. The dashboard
> Site URL drifted to a Vercel **preview** host (Supabase Branching pushes
> preview auth config onto the project), which sent real users preview links.
> Pinning the host in the template guarantees the public origin even if Site URL
> drifts again. **After changing the origin, re-paste both templates into the
> dashboard** — editing the repo files alone does not affect sent mail. If the
> public domain ever changes, update the `href` in both files and re-paste.

### 2. Custom SMTP — Project Settings → Authentication → SMTP Settings

Enable **Custom SMTP** and fill in a provider. Any SMTP provider works; the
default sender does not. Example using **Resend** (free tier: 3,000/month):

| Field        | Value                                  |
| ------------ | -------------------------------------- |
| Host         | `smtp.resend.com`                      |
| Port         | `465`                                  |
| Username     | `resend`                               |
| Password     | a Resend API key                       |
| Sender email | an address on a Resend-verified domain |
| Sender name  | `Fox Valley Church Life Groups`        |

(Resend requires verifying your sending domain via DNS first.)

### 3. Rate limits — Authentication → Rate Limits

Raise **Emails per hour** above the tiny default test cap so a real onboarding
batch isn't throttled.

### 4. URL configuration — Authentication → URL Configuration

- **Site URL** = the public production origin, **`https://fvclifegroups.vercel.app`**
  (not a preview/`*-projects.vercel.app` host). The pinned templates already hard-code
  this host, but Site URL still governs server-action `redirectTo` validation and any
  template that uses `{{ .SiteURL }}`, so keep it correct.
- **Redirect URLs** must include, on that same host: `/reset-password`,
  `/auth/confirm`, `/login`.
- In the Vercel project, set `NEXT_PUBLIC_SITE_URL` (and/or `SITE_URL`) to
  `https://fvclifegroups.vercel.app` so the app's invite/reset `redirectTo`
  resolves to the public host (see `lib/shared/site-origin.ts`).

#### Verify the link host

After setting Site URL and re-pasting the templates, trigger a fresh reset
(`/forgot-password`, or super-admin **Send reset link**) to an address you
control and confirm the email's button links to
`https://fvclifegroups.vercel.app/reset-password?...` — **not** a
`*-projects.vercel.app` preview host.

## Runbook: a sent reset/invite link shows a preview host

The repo templates already hard-code `https://fvclifegroups.vercel.app`
(`supabase/templates/recovery.html`, `invite.html`), so a preview host
(`*-projects.vercel.app`) in a **sent** email means the **live dashboard
template is stale** — the host pin only takes effect once the template is pasted
in the dashboard. Editing the repo files alone never changes sent mail. Work the
list in order and stop as soon as a fresh reset shows the public host:

1. **Re-paste both templates — the decisive step.** Authentication → Email
   Templates → **Reset Password** ← `supabase/templates/recovery.html`, and
   **Invite user** ← `supabase/templates/invite.html` (§1 above). The pinned
   `href` makes the link immune to Site URL drift, so this alone fixes the link.
2. **Fix the Site URL** (§4 above): Authentication → URL Configuration →
   **Site URL** = `https://fvclifegroups.vercel.app`, and confirm the **Redirect
   URLs** list `/reset-password`, `/auth/confirm`, `/login` on that host.
3. **Stop the drift at its source.** The Site URL drifts because **Supabase
   Branching** pushes each preview branch's auth config onto the project. Clean
   up stale preview branches (e.g. an `INACTIVE` branch left behind by a closed
   PR — check Branches in the dashboard or `list_branches`) and confirm no open
   preview branch is overwriting the production Site URL. The host pin in step 1
   still protects the link if Branching reverts the Site URL again.
4. **Verify.** Trigger a fresh reset and inspect the button `href` **without
   clicking** (Outlook / Defender Safe Links prefetch burns the single-use
   token). It must point to `https://fvclifegroups.vercel.app/reset-password?...`.

## Verifying delivery

1. From `/admin/super-admin`, invite a real address you control via **Send invite**.
2. Confirm the email arrives and its link lands on `/reset-password` → set a password.
3. In the Supabase dashboard, **Logs → Auth** should show a mail send, and the
   `invite-user` Edge Function returns 200.

If email still doesn't arrive after SMTP is configured, check the provider's
dashboard (Resend "Emails" log) for bounces/blocks and confirm the sender domain
is verified.
