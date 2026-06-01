import Link from "next/link";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { LaunchPlanningInputs } from "@/lib/admin/launch-planning";

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
    <section
      style={{
        background: P.terraSoft,
        border: `1px solid ${P.terra}`,
        borderRadius: 12,
        padding: "16px 20px",
        display: "grid",
        gap: 12,
      }}
    >
      <header>
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 600,
          }}
        >
          Forecast confidence
        </span>
        <h2
          style={{
            margin: "4px 0 0",
            fontFamily: fontBody,
            fontSize: 16,
            color: P.ink,
            fontWeight: 600,
          }}
        >
          Setup signals to review
        </h2>
      </header>

      {errorMessages.length > 0 ? (
        <ul style={{ listStyle: "disc", margin: 0, padding: "0 0 0 18px" }}>
          {errorMessages.map((msg, i) => (
            <li
              key={`err-${i}`}
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink2,
                lineHeight: 1.5,
              }}
            >
              {msg}
            </li>
          ))}
        </ul>
      ) : null}

      {items.length > 0 ? (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 10,
          }}
        >
          {items.map((w) => (
            <li
              key={w.key}
              style={{
                display: "grid",
                gap: 4,
              }}
            >
              <strong
                style={{
                  fontFamily: fontBody,
                  fontSize: 14,
                  color: P.ink,
                  fontWeight: 600,
                }}
              >
                {w.title}
              </strong>
              <p
                style={{
                  margin: 0,
                  fontFamily: fontBody,
                  fontSize: 13,
                  color: P.ink2,
                  lineHeight: 1.5,
                }}
              >
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
                            style={{
                              color: P.ink,
                              textDecoration: "underline",
                              fontWeight: 600,
                            }}
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
