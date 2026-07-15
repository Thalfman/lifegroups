import Link from "next/link";

// A shared, dashed "preserved, not actively maintained" banner for the off-nav
// pre-pivot surfaces (#596). These routes still resolve by direct URL and stay
// role-guarded — they're intentionally frozen, not deleted — so this strip tells
// a viewer the surface isn't kept up to date, heading off bug reports against it.
//
// It renders only on those frozen pages; the live Care · Plan · Multiply
// surfaces never show it. Visual only — no behavior, routing, or visibility
// change. `maxWidth` mirrors PageHeader / PageBody so the strip aligns with the
// page gutters it sits between.
//
// `movedTo` (#901) appends a "this moved" link to the post-pivot surface that
// absorbed the workflow (registry-derived via movedToFor, lib/nav/route-registry)
// so an old bookmark clearly points at the current home, in current vocabulary.
// null/undefined renders the plain banner — used where no live replacement
// exists (ADR 0033: calendar/launches still live only here; check-ins have no
// canonical surface).
export function FrozenSurfaceBanner({
  maxWidth = 1240,
  movedTo,
}: {
  maxWidth?: number;
  movedTo?: { href: string; label: string } | null;
}) {
  return (
    <div
      className="mx-auto w-full px-4 pt-[22px] md:px-10 md:pt-9"
      style={{ maxWidth }}
    >
      <p
        role="note"
        className="m-0 rounded-md border border-dashed border-line bg-surfaceAlt px-4 py-3 font-sans text-sm text-ink2"
      >
        <span className="font-semibold text-ink">
          Preserved, not actively maintained.
        </span>{" "}
        This is a pre-pivot surface kept available by direct link but frozen. It
        isn&rsquo;t being updated and may not reflect the current Care · Plan ·
        Multiply model.
        {movedTo ? (
          <>
            {" "}
            The current home for this work is{" "}
            <Link
              href={movedTo.href}
              className="font-semibold text-ink underline underline-offset-2"
            >
              {movedTo.label}
            </Link>
            .
          </>
        ) : null}
      </p>
    </div>
  );
}
