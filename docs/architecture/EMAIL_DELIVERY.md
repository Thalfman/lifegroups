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
> card always returns a **copyable setup link** ("Copy invite link", and a backup
> link under "Send invite") that the admin can paste into their own email/text.
> The shareable invite link does not depend on email at all.

## One-time setup (Supabase dashboard → project `Fvclifegroups`)

### 1. Email templates — Authentication → Email Templates

- **Invite user** → paste the contents of `supabase/templates/invite.html`.
- **Reset Password** → paste the contents of `supabase/templates/recovery.html`.

Both templates deliberately use `{{ .TokenHash }}` and link to
`/reset-password?token_hash=…&type=…` (not the default `{{ .ConfirmationURL }}`),
so a mail-scanner's GET can't burn the single-use token and verification works
cross-device. Keep them in sync with the files in `supabase/templates/`.

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

- **Site URL** = the production origin (e.g. the Vercel production URL).
- **Redirect URLs** must include: `/reset-password`, `/auth/confirm`, `/login`.

## Verifying delivery

1. From `/admin/super-admin`, invite a real address you control via **Send invite**.
2. Confirm the email arrives and its link lands on `/reset-password` → set a password.
3. In the Supabase dashboard, **Logs → Auth** should show a mail send, and the
   `invite-user` Edge Function returns 200.

If email still doesn't arrive after SMTP is configured, check the provider's
dashboard (Resend "Emails" log) for bounces/blocks and confirm the sender domain
is verified.
