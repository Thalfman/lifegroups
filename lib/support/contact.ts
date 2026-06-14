// Public support contact, sourced from config/env (NEXT_PUBLIC_SUPPORT_EMAIL)
// rather than hardcoded personal data, with a placeholder fallback so the
// public support page always renders a reachable contact even before the
// address is finalized (mobile store roadmap Phase 3 / #562). Both stores
// require a reachable support contact.

export type SupportContact = {
  /** The support email address shown to the user. */
  email: string;
  /** True when the placeholder is used because no contact is configured. */
  isPlaceholder: boolean;
};

// A non-personal, church-level placeholder used until NEXT_PUBLIC_SUPPORT_EMAIL
// is wired. Deliberately a shared functional inbox, never an individual's
// address — the support contact must not be hardcoded personal data.
export const PLACEHOLDER_SUPPORT_EMAIL =
  "lifegroups-support@foxvalleychurch.org";

// Reads the configured support email, falling back to the placeholder. Safe to
// call from Server Components and route handlers; NEXT_PUBLIC_SUPPORT_EMAIL is
// inlined at build time.
export function getSupportContact(): SupportContact {
  const configured = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  if (configured) {
    return { email: configured, isPlaceholder: false };
  }
  return { email: PLACEHOLDER_SUPPORT_EMAIL, isPlaceholder: true };
}

// Builds a mailto: link, optionally prefilling a subject line. Encodes the
// subject so a space or punctuation can't break the href.
export function supportMailtoHref(
  contact: SupportContact,
  subject?: string
): string {
  const base = `mailto:${contact.email}`;
  if (!subject) return base;
  return `${base}?subject=${encodeURIComponent(subject)}`;
}
