import Link from "next/link";
import type { LaunchPlanningInputs } from "@/lib/admin/launch-planning";
import { eyebrowClassName } from "./section-styles";

export type LaunchPlanningSetupWarningsProps = {
  inputs: LaunchPlanningInputs;
  // Forwarded from the page-level load. Surfaced as a single banner row
  // so the operator can tell the difference between "no groups" and
  // "couldn't read groups". Each is admin-readable but doesn't include
  // any sensitive data.
  errors: {
    groups: string | null;
    overrides: string | null;
    memberships: string | null;
    metricDefaults: string | null;
  };
};

type NavLink = { href: string; label: string };

type Warning = {
  key: string;
  title: string;
  detail: string;
  link?: NavLink;
  // When a signal is fixed by visiting more than one surface (e.g. "no active
  // groups" → add People, then create Groups), list them all. Takes precedence
  // over the single `link`.
  links?: NavLink[];
};

export function LaunchPlanningSetupWarnings({
  inputs,
  errors,
}: LaunchPlanningSetupWarningsProps) {
  const items: Warning[] = [];

  // First-run pointer: with no active groups there is nothing real to forecast
  // from, so the figures above are running purely on built-in starting
  // assumptions. Point the operator at where the real inputs come from rather
  // than leaving them on a forecast with no groups behind it. Gate on a
  // successful groups read — on a read failure the bundle also reports
  // groups: [], and the error banner below already explains that; we must not
  // present a read failure as a confident "no groups" diagnosis.
  if (inputs.active_group_count === 0 && !errors.groups) {
    items.push({
      key: "no_groups",
      title: "No active groups yet",
      detail:
        "Launch planning forecasts from your active groups and their rosters. The figures above use built-in starting assumptions until then — add people, then create your first groups to see a real capacity picture.",
      links: [
        { href: "/admin/people", label: "Add people" },
        { href: "/admin/groups", label: "Create groups" },
      ],
    });
  }

  if (inputs.unknown_capacity_group_count > 0) {
    items.push({
      key: "unknown_capacity",
      title: `${inputs.unknown_capacity_group_count} active group${
        inputs.unknown_capacity_group_count === 1 ? "" : "s"
      } missing capacity`,
      detail:
        "Groups without an effective capacity contribute 0 seats to the forecast. Set a capacity (per group or as the ministry-wide default) to improve forecast confidence.",
      link: { href: "/admin/groups", label: "Set capacities" },
    });
  }

  if (inputs.excluded_active_group_count > 0) {
    items.push({
      key: "excluded",
      title: `${inputs.excluded_active_group_count} active group${
        inputs.excluded_active_group_count === 1 ? "" : "s"
      } excluded from capacity`,
      detail:
        "Groups flagged 'exclude from capacity metrics' are skipped in the projection. That matches the admin dashboard, but if the exclusion was a misclick, clear it in Settings.",
      link: { href: "/admin/settings", label: "Review overrides" },
    });
  }

  if (
    inputs.active_group_count > 0 &&
    inputs.current_participants === 0 &&
    inputs.excluded_active_group_count < inputs.active_group_count
  ) {
    items.push({
      key: "no_members",
      title: "Active groups but no active memberships",
      detail:
        "The forecast counts active memberships only. If groups exist but membership rosters are empty, current-participant counts will read low.",
      link: { href: "/admin/people", label: "Review people" },
    });
  }

  const errorMessages = [
    errors.groups && `Groups read failed: ${errors.groups}`,
    errors.overrides && `Overrides read failed: ${errors.overrides}`,
    errors.memberships && `Memberships read failed: ${errors.memberships}`,
    errors.metricDefaults && `Defaults read failed: ${errors.metricDefaults}`,
  ].filter((s): s is string => Boolean(s));

  if (items.length === 0 && errorMessages.length === 0) return null;

  return (
    <section className="grid gap-3 rounded-md border border-clay bg-claySoft px-5 py-4">
      <header>
        <span className={eyebrowClassName}>Forecast confidence</span>
        <h2 className="m-0 mt-1 font-sans text-[16px] font-semibold text-ink">
          Setup signals to review
        </h2>
      </header>

      {errorMessages.length > 0 ? (
        <ul className="m-0 list-disc p-0 pl-[18px]">
          {errorMessages.map((msg, i) => (
            <li
              key={`err-${i}`}
              className="font-sans text-sm leading-normal text-ink2"
            >
              {msg}
            </li>
          ))}
        </ul>
      ) : null}

      {items.length > 0 ? (
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {items.map((w) => (
            <li key={w.key} className="grid gap-1">
              <strong className="font-sans text-base font-semibold text-ink">
                {w.title}
              </strong>
              <p className="m-0 font-sans text-sm leading-normal text-ink2">
                {w.detail}
                {(() => {
                  const links = w.links ?? (w.link ? [w.link] : []);
                  if (links.length === 0) return null;
                  return (
                    <>
                      {" "}
                      {links.map((l, i) => (
                        <span key={l.href}>
                          {i > 0 ? " · " : null}
                          <Link
                            href={l.href}
                            className="font-semibold text-ink underline"
                          >
                            {l.label}
                          </Link>
                        </span>
                      ))}
                      .
                    </>
                  );
                })()}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
