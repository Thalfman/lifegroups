"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { replaceTabParam } from "@/lib/nav/tab-url";
import type { ReactNode } from "react";
import { Card } from "@/components/lg/Card";
import { Badge, STATUS_TONES } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PersonGroupAssign } from "@/components/admin/person-detail/person-group-assign";
import {
  personTabsFor,
  resolvePersonTab,
  type PersonTabKey,
} from "@/components/admin/person-detail/person-tabs";

// The person a detail page describes, flattened to a serializable shape so the
// server page does the reads and this client shell only renders. `kind`
// distinguishes auth-backed login profiles from non-login member records — the
// distinction that gates the Access and Care tabs (issue #302 boundaries).
export type PersonGroupRef = {
  id: string;
  name: string;
  roleInGroup: string;
};

export type PersonDetail = {
  kind: "profile" | "member";
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  roleLabel: string;
  // Login profiles only (members are non-login participant records).
  isLoginBacked: boolean;
  // Leader / co-leader only — the only profiles with a care model.
  isLeader: boolean;
  needsContact: boolean;
  // Whether this person can be staffed into a group: members always, login
  // profiles only when they are leaders/co-leaders (the assign-leader RPC
  // rejects other roles).
  canPlaceInGroup: boolean;
  groups: PersonGroupRef[];
  // Guarded shepherd-care surface for this leader (leaders only).
  careHref: string | null;
};

const ROLE_IN_GROUP_LABEL: Record<string, string> = {
  leader: "Shepherd",
  co_leader: "Co-shepherd",
  member: "Member",
};

const BODY_TEXT = "font-sans text-sm text-ink2";
const EMPTY_TEXT = "font-sans text-sm italic text-ink3";

export function PersonDetailShell({
  person,
  availableGroups,
}: {
  person: PersonDetail;
  availableGroups: { id: string; name: string }[];
}) {
  // Which tabs exist depends on the person (issue #302 boundaries) — the
  // derivation lives in the pure person-tabs module, shared with its tests.
  const tabs = personTabsFor({
    isLeader: person.isLeader,
    isActive: person.status === "active",
    isLoginBacked: person.isLoginBacked,
  });

  // The active tab is driven by the URL's `?tab=` param (the Multiply/People
  // mechanism), so a refresh keeps your place and "the Group tab of this
  // person" is a shareable link. Resolution is against the person's *visible*
  // tabs: a leader's `?tab=care` link opened on a member degrades to Overview.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = resolvePersonTab(searchParams.get("tab"), tabs);

  function selectTab(key: PersonTabKey) {
    if (key === active) return;
    replaceTabParam(pathname, searchParams.toString(), key);
  }

  const panels: Record<PersonTabKey, ReactNode> = {
    overview: <OverviewPanel person={person} />,
    group: <GroupPanel person={person} availableGroups={availableGroups} />,
    care: <CarePanel person={person} />,
    activity: <ActivityPanel person={person} />,
    access: <AccessPanel person={person} />,
  };

  return (
    <div className="grid gap-6">
      <div
        role="tablist"
        aria-label="Person sections"
        className="flex flex-wrap gap-1 self-start rounded-pill border border-line bg-surface p-[3px]"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`person-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`person-panel-${tab.key}`}
            onClick={() => selectTab(tab.key)}
            className={cn(
              "inline-flex cursor-pointer items-center rounded-pill border-none px-3.5 py-2 font-sans text-sm transition-colors duration-150",
              active === tab.key
                ? "bg-clay font-bold text-surface"
                : "bg-transparent font-medium text-ink3 hover:bg-surfaceAlt"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`person-panel-${tab.key}`}
          aria-labelledby={`person-tab-${tab.key}`}
          hidden={active !== tab.key}
        >
          {panels[tab.key]}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function OverviewPanel({ person }: { person: PersonDetail }) {
  return (
    <Card className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge tone="neutral" dot>
          {person.roleLabel}
        </Badge>
        <Badge
          tone={person.status === "active" ? STATUS_TONES.well : "ghost"}
          dot
        >
          {person.status === "active" ? "Active" : "Inactive"}
        </Badge>
        {/* Only an *active* leader's care cadence is tracked — an inactive
            leader must not read a false "No current concerns". */}
        {person.isLeader && person.status === "active" ? (
          <Badge
            tone={
              person.needsContact ? STATUS_TONES.followUp : STATUS_TONES.well
            }
            dot
          >
            {person.needsContact ? "Needs contact" : "No current concerns"}
          </Badge>
        ) : null}
      </div>
      <DefList
        rows={[
          { label: "Name", value: person.fullName },
          { label: "Role", value: person.roleLabel },
          {
            label: "Status",
            value: person.status === "active" ? "Active" : "Inactive",
          },
          { label: "Email", value: person.email ?? "—" },
          { label: "Phone", value: person.phone ?? "—" },
        ]}
      />
    </Card>
  );
}

function GroupPanel({
  person,
  availableGroups,
}: {
  person: PersonDetail;
  availableGroups: { id: string; name: string }[];
}) {
  return (
    <div className="grid gap-4">
      <Card className="grid gap-3">
        <PanelHeading
          title="Current group assignment"
          caption="Where this person stands in the roster today."
        />
        {person.groups.length === 0 ? (
          <p className={cn("m-0", EMPTY_TEXT)}>
            Not currently assigned to a group.
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {person.groups.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <Link
                  href={`/admin/groups/${g.id}`}
                  className="font-display text-md text-ink no-underline hover:underline"
                >
                  {g.name}
                </Link>
                <Badge tone="neutral" dot>
                  {ROLE_IN_GROUP_LABEL[g.roleInGroup] ?? g.roleInGroup}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {person.canPlaceInGroup && person.status === "active" ? (
        <Card className="grid gap-3">
          <PanelHeading
            title="Assign to a group"
            caption={
              person.kind === "profile"
                ? "Assign this shepherd to a group as shepherd or co-shepherd."
                : "Assign this member to a group."
            }
          />
          <PersonGroupAssign
            kind={person.kind}
            personId={person.id}
            availableGroups={availableGroups}
          />
        </Card>
      ) : null}
    </div>
  );
}

function CarePanel({ person }: { person: PersonDetail }) {
  return (
    <Card className="grid gap-3">
      <PanelHeading
        title="Care"
        caption="Shepherd care and follow-ups for this shepherd."
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge
          tone={person.needsContact ? STATUS_TONES.followUp : STATUS_TONES.well}
          dot
        >
          {person.needsContact ? "Needs contact" : "No current concerns"}
        </Badge>
      </div>
      <p className={cn("m-0", BODY_TEXT)}>
        Full care history, private notes, and follow-ups live on the guarded
        care page; they never leave that surface.
      </p>
      {person.careHref ? (
        <p className="m-0">
          <Link
            href={person.careHref}
            className="font-sans text-sm font-semibold text-clay no-underline hover:underline"
          >
            Open this shepherd&rsquo;s care history →
          </Link>
        </p>
      ) : null}
    </Card>
  );
}

function ActivityPanel({ person }: { person: PersonDetail }) {
  return (
    <Card className="grid gap-3">
      <PanelHeading
        title="Activity"
        caption="Where this person stands today."
      />
      {person.groups.length === 0 ? (
        <p className={cn("m-0", EMPTY_TEXT)}>
          Not currently part of any group.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {person.groups.map((g) => (
            <li key={g.id} className={BODY_TEXT}>
              {person.kind === "profile" ? "Shepherds" : "Member of"}{" "}
              <Link
                href={`/admin/groups/${g.id}`}
                className="text-ink underline"
              >
                {g.name}
              </Link>{" "}
              as {ROLE_IN_GROUP_LABEL[g.roleInGroup] ?? g.roleInGroup}.
            </li>
          ))}
        </ul>
      )}
      <p className={cn("m-0", EMPTY_TEXT)}>
        This page shows current standing; a detailed history (check-ins, edits)
        isn&rsquo;t surfaced here yet.
      </p>
      {/* Care touchpoints ARE recorded over time — point there rather than
          dead-ending (leaders only; the care surface is guarded). */}
      {person.careHref ? (
        <p className="m-0">
          <Link
            href={person.careHref}
            className="font-sans text-sm font-semibold text-clay no-underline hover:underline"
          >
            Care touchpoints live in this shepherd&rsquo;s care history →
          </Link>
        </p>
      ) : null}
    </Card>
  );
}

function AccessPanel({ person }: { person: PersonDetail }) {
  return (
    <Card className="grid gap-3">
      <PanelHeading title="Access" caption="Role and status details." />
      <DefList
        rows={[
          { label: "Role", value: person.roleLabel },
          { label: "Email", value: person.email ?? "—" },
          {
            label: "Status",
            value: person.status === "active" ? "Active" : "Inactive",
          },
        ]}
      />
      <p className={cn("m-0", EMPTY_TEXT)}>
        Manage role and deactivation from the People directory row.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function PanelHeading({ title, caption }: { title: string; caption: string }) {
  return (
    <div>
      <h3 className="m-0 font-display text-lg font-medium text-ink">{title}</h3>
      <p className="m-0 mt-0.5 font-sans text-xs text-ink3">{caption}</p>
    </div>
  );
}

function DefList({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="m-0 grid grid-cols-1 gap-2 md:grid-cols-[minmax(80px,140px)_1fr] md:gap-x-4 md:gap-y-2">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="font-sans text-2xs font-semibold uppercase tracking-wide text-ink3">
            {r.label}
          </dt>
          <dd className={cn("m-0", BODY_TEXT)}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
