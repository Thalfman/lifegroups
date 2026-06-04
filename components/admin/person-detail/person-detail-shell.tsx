"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { PBadge } from "@/components/pastoral/atoms";
import { PersonGroupAssign } from "@/components/admin/person-detail/person-group-assign";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";

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
  groups: PersonGroupRef[];
  // Guarded shepherd-care surface for this leader (leaders only).
  careHref: string | null;
};

type TabKey = "overview" | "group" | "care" | "activity" | "access";

const ROLE_IN_GROUP_LABEL: Record<string, string> = {
  leader: "Leader",
  co_leader: "Co-leader",
  member: "Member",
};

export function PersonDetailShell({
  person,
  availableGroups,
}: {
  person: PersonDetail;
  availableGroups: { id: string; name: string }[];
}) {
  // Access tab: auth-backed login profiles only — members never sign in, so a
  // member detail page must not show Access or any account affordance. Care
  // tab: leader / co-leader only — the care model is per-leader, so member
  // pages must not show leader shepherd-care history (issue #302 boundaries).
  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "group", label: "Group" },
    ...(person.isLeader ? [{ key: "care" as const, label: "Care" }] : []),
    { key: "activity", label: "Activity" },
    ...(person.isLoginBacked
      ? [{ key: "access" as const, label: "Access" }]
      : []),
  ];

  const [active, setActive] = useState<TabKey>("overview");

  const panels: Record<TabKey, ReactNode> = {
    overview: <OverviewPanel person={person} />,
    group: <GroupPanel person={person} availableGroups={availableGroups} />,
    care: <CarePanel person={person} />,
    activity: <ActivityPanel person={person} />,
    access: <AccessPanel person={person} />,
  };

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div
        role="tablist"
        aria-label="Person sections"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderRadius: 999,
          padding: 3,
          alignSelf: "start",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`person-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`person-panel-${tab.key}`}
            onClick={() => setActive(tab.key)}
            style={tabItemStyle(active === tab.key)}
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
    <Card>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <PBadge tone="neutral">{person.roleLabel}</PBadge>
        <PBadge tone={person.status === "active" ? "healthy" : "pause"}>
          {person.status === "active" ? "Active" : "Inactive"}
        </PBadge>
        {person.isLeader ? (
          <PBadge tone={person.needsContact ? "followup" : "healthy"}>
            {person.needsContact ? "Needs contact" : "No current concerns"}
          </PBadge>
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
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <PanelHeading
          title="Current group assignment"
          caption="Where this person stands in the roster today."
        />
        {person.groups.length === 0 ? (
          <p style={emptyTextStyle}>Not currently assigned to a group.</p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              margin: "8px 0 0",
              padding: 0,
              display: "grid",
              gap: 8,
            }}
          >
            {person.groups.map((g) => (
              <li
                key={g.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <Link
                  href={`/admin/groups/${g.id}`}
                  style={{
                    fontFamily: fontDisplay,
                    fontSize: 16,
                    color: P.ink,
                    textDecoration: "none",
                  }}
                >
                  {g.name}
                </Link>
                <PBadge tone="neutral">
                  {ROLE_IN_GROUP_LABEL[g.roleInGroup] ?? g.roleInGroup}
                </PBadge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {person.status === "active" ? (
        <Card>
          <PanelHeading
            title="Place in a group"
            caption={
              person.kind === "profile"
                ? "Assign this leader to a group as leader or co-leader."
                : "Add this member to a group."
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
    <Card>
      <PanelHeading
        title="Care"
        caption="Shepherd care and follow-ups for this leader."
      />
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: 8,
        }}
      >
        <PBadge tone={person.needsContact ? "followup" : "healthy"}>
          {person.needsContact ? "Needs contact" : "No current concerns"}
        </PBadge>
      </div>
      <p style={{ ...bodyTextStyle, marginTop: 12 }}>
        Full care history, private notes, and follow-ups live on the guarded
        care page — they never leave that surface.
      </p>
      {person.careHref ? (
        <p style={{ marginTop: 12 }}>
          <Link
            href={person.careHref}
            style={{
              fontFamily: fontSans,
              fontSize: 13,
              fontWeight: 600,
              color: P.terra,
              textDecoration: "none",
            }}
          >
            Open this leader&rsquo;s care history →
          </Link>
        </p>
      ) : null}
    </Card>
  );
}

function ActivityPanel({ person }: { person: PersonDetail }) {
  return (
    <Card>
      <PanelHeading
        title="Activity"
        caption="Recent group and admin activity."
      />
      {person.groups.length === 0 ? (
        <p style={emptyTextStyle}>No recent activity recorded.</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: "8px 0 0",
            padding: 0,
            display: "grid",
            gap: 8,
          }}
        >
          {person.groups.map((g) => (
            <li key={g.id} style={bodyTextStyle}>
              {person.kind === "profile" ? "Leads" : "Member of"}{" "}
              <Link
                href={`/admin/groups/${g.id}`}
                style={{ color: P.ink, textDecoration: "underline" }}
              >
                {g.name}
              </Link>{" "}
              as {ROLE_IN_GROUP_LABEL[g.roleInGroup] ?? g.roleInGroup}.
            </li>
          ))}
        </ul>
      )}
      <p style={{ ...emptyTextStyle, marginTop: 12 }}>
        Detailed activity history (check-ins, edits) isn&rsquo;t tracked on this
        page yet — it shows current standing only.
      </p>
    </Card>
  );
}

function AccessPanel({ person }: { person: PersonDetail }) {
  return (
    <Card>
      <PanelHeading
        title="Access"
        caption="Login and role details. Shown only for people who sign in."
      />
      <DefList
        rows={[
          { label: "Signs in", value: "Yes — auth-backed profile" },
          { label: "Role", value: person.roleLabel },
          { label: "Login email", value: person.email ?? "—" },
          {
            label: "Status",
            value: person.status === "active" ? "Active" : "Inactive",
          },
        ]}
      />
      <p style={{ ...emptyTextStyle, marginTop: 12 }}>
        Manage role and deactivation from the People directory row.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "18px 22px",
        display: "grid",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

function PanelHeading({ title, caption }: { title: string; caption: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 18,
          color: P.ink,
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: fontSans,
          fontSize: 12,
          color: P.ink3,
          margin: "2px 0 0",
        }}
      >
        {caption}
      </p>
    </div>
  );
}

function DefList({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(80px, 140px) 1fr",
        gap: "8px 16px",
        margin: 0,
      }}
    >
      {rows.map((r) => (
        <div key={r.label} style={{ display: "contents" }}>
          <dt
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 600,
            }}
          >
            {r.label}
          </dt>
          <dd style={{ ...bodyTextStyle, margin: 0 }}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const bodyTextStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink2,
  lineHeight: 1.55,
};

const emptyTextStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink3,
  fontStyle: "italic",
};

function tabItemStyle(activeTab: boolean): CSSProperties {
  return {
    fontFamily: fontSans,
    fontSize: 13,
    fontWeight: activeTab ? 700 : 500,
    color: activeTab ? P.surface : P.ink3,
    background: activeTab ? P.terra : "transparent",
    border: "none",
    padding: "8px 14px",
    cursor: "pointer",
    borderRadius: 999,
  };
}
