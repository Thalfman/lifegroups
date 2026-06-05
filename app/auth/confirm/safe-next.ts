import type { EmailOtpType } from "@supabase/supabase-js";

// The set of OTP types Supabase's verifyOtp accepts for token_hash links.
const VALID_OTP_TYPES: ReadonlySet<string> = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export function isValidOtpType(value: string | null): value is EmailOtpType {
  return value !== null && VALID_OTP_TYPES.has(value);
}

// Only allow same-origin relative redirects so the `next` param can't be turned
// into an open redirect. Rejects absolute URLs (`https://evil.com`),
// protocol-relative URLs (`//evil.com`), and backslash tricks (`/\evil.com`),
// falling back to the password-reset page.
export function safeNext(raw: string | null | undefined): string {
  const fallback = "/reset-password";
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
