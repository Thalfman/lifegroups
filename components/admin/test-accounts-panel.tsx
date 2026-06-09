"use client";

import { useCallback, useState, useTransition } from "react";
import { SectionHeader } from "@/components/layout/shell";
import { PButton } from "@/components/pastoral/button";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import {
  testAccountsDiagnose,
  testAccountsDisable,
  testAccountsEnable,
  testAccountsStatus,
  type TestAccountsResponse,
} from "@/app/(protected)/admin/super-admin/test-accounts-actions";

type Props = {
  initialStatus: TestAccountsResponse | null;
  initialErrors: string[];
};

type Pending = "enable" | "disable" | "refresh" | "diagnose" | null;

const STATE_DOT: Record<string, { color: string; label: string }> = {
  exists: { color: P.sage, label: "exists" },
  active: { color: P.sage, label: "active" },
  created: { color: P.sage, label: "created" },
  updated: { color: P.sage, label: "updated" },
  added: { color: P.sage, label: "added" },
  archived: { color: P.ink3, label: "archived" },
  missing: { color: P.terra, label: "missing" },
  deleted: { color: P.ink3, label: "deleted" },
  inactive: { color: P.ink3, label: "inactive" },
  deactivated: { color: P.ink3, label: "deactivated" },
  none: { color: P.ink3, label: "none" },
  skipped: { color: P.mustard, label: "skipped" },
};

// Friendly nouns for the table names that show up in raw Edge Function
// lookup errors (e.g. "group_leaders lookup failed: …").
const LOOKUP_SUBJECT_LABELS: Record<string, string> = {
  group_leaders: "group leader",
  profiles: "profile",
  groups: "group",
  members: "member",
};

// Translate a raw test-account error into operator language (#452). The raw
// string stays available behind the Details disclosure; this only chooses the
// primary message. Copy only — the Edge Function and server actions are
// untouched.
function translateTestAccountError(raw: string): string {
  if (/JSON object requested, multiple \(or no\) rows returned/i.test(raw)) {
    const subject = raw.match(/^([a-z_]+) lookup failed/i)?.[1];
    const friendly = subject
      ? (LOOKUP_SUBJECT_LABELS[subject] ?? subject.replace(/_/g, " "))
      : null;
    return friendly
      ? `The expected ${friendly} test record was not found, or more than one matching record exists.`
      : "An expected test record was not found, or more than one matching record exists.";
  }
  if (/failed to fetch|fetch failed|network|econn|timed? ?out/i.test(raw)) {
    return "The test-account service couldn’t be reached. It may be offline, or the network blocked the request.";
  }
  if (/not authoriz|unauthoriz|forbidden|\b401\b|\b403\b/i.test(raw)) {
    return "This session isn’t authorized to run test-account checks. Sign out and back in as the super admin.";
  }
  return "The test-account check returned an unexpected error.";
}

function StatePill({ state }: { state: string }) {
  const cfg = STATE_DOT[state] ?? { color: P.ink3, label: state };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: fontSans,
        fontSize: 12,
        color: P.ink,
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: 999,
          background: cfg.color,
        }}
      />
      {cfg.label}
    </span>
  );
}

export function TestAccountsPanel({ initialStatus, initialErrors }: Props) {
  const [status, setStatus] = useState<TestAccountsResponse | null>(
    initialStatus
  );
  const [errors, setErrors] = useState<string[]>(initialErrors);
  const [warnings, setWarnings] = useState<string[]>(
    initialStatus?.warnings ?? []
  );
  const [pending, setPending] = useState<Pending>(null);
  const [, startTransition] = useTransition();

  const run = useCallback(
    (
      action: "status" | "enable" | "disable" | "diagnose",
      confirmText: string | null
    ) => {
      if (confirmText && !window.confirm(confirmText)) return;
      const tag: Pending =
        action === "status"
          ? "refresh"
          : action === "diagnose"
            ? "diagnose"
            : action;
      setPending(tag);
      setErrors([]);
      setWarnings([]);
      startTransition(async () => {
        const result =
          action === "status"
            ? await testAccountsStatus()
            : action === "enable"
              ? await testAccountsEnable()
              : action === "disable"
                ? await testAccountsDisable()
                : await testAccountsDiagnose();
        if (result.ok) {
          setStatus(result.value);
          setWarnings(result.value.warnings ?? []);
          if (!result.value.ok) setErrors(result.value.errors);
        } else {
          setErrors(result.errors);
        }
        setPending(null);
      });
    },
    []
  );

  const handleEnable = useCallback(() => {
    const remote = status?.isRemoteSupabase === true;
    const message = remote
      ? "You are about to enable test login accounts on a REMOTE database. These accounts have known passwords. Proceed?"
      : "Enable test login accounts? Their passwords are known to anyone with the env file.";
    run("enable", message);
  }, [run, status]);

  const handleDisable = useCallback(() => {
    run(
      "disable",
      "Disable all known test accounts? Their logins will stop working immediately."
    );
  }, [run]);

  const handleRefresh = useCallback(() => {
    run("status", null);
  }, [run]);

  const handleDiagnose = useCallback(() => {
    run("diagnose", null);
  }, [run]);

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="Test accounts"
        title="Temporary login accounts for role and mobile testing"
        description="Use these temporary accounts for role and mobile testing. Disable them before launch — known-password accounts must not remain active for production."
      />

      <div
        role="note"
        style={{
          background: P.mustardSoft,
          border: `1px solid ${P.mustard}`,
          borderRadius: 8,
          padding: "10px 14px",
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink,
        }}
      >
        These are real user accounts that sign in through the normal /login
        page. Passwords live only in the Edge Function environment — never
        displayed here.
      </div>

      <div
        style={{
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderRadius: 10,
          padding: "18px 22px",
          display: "grid",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "center",
            justifyContent: "space-between",
            fontFamily: fontSans,
            fontSize: 12,
            color: P.ink2,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <span>
              Overall:{" "}
              <StatePill
                state={status?.enabledOverall ? "active" : "missing"}
              />
            </span>
            <span>
              Database target:{" "}
              {status?.isRemoteSupabase === undefined
                ? "unknown"
                : status.isRemoteSupabase
                  ? "remote"
                  : "local"}
            </span>
            <span>
              Group A: <StatePill state={status?.groups?.a ?? "missing"} />
            </span>
            <span>
              Group B: <StatePill state={status?.groups?.b ?? "missing"} />
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <PButton
              tone="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={pending !== null}
            >
              {pending === "refresh" ? "Refreshing…" : "Refresh status"}
            </PButton>
            <PButton
              tone="ghost"
              size="sm"
              onClick={handleDiagnose}
              disabled={pending !== null}
            >
              {pending === "diagnose" ? "Diagnosing…" : "Diagnose"}
            </PButton>
            <PButton
              tone="solid"
              size="sm"
              onClick={handleEnable}
              disabled={pending !== null}
            >
              {pending === "enable" ? "Enabling…" : "Enable test accounts"}
            </PButton>
            <PButton
              tone="terra"
              size="sm"
              onClick={handleDisable}
              disabled={pending !== null}
            >
              {pending === "disable" ? "Disabling…" : "Disable test accounts"}
            </PButton>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontFamily: fontSans,
              fontSize: 13,
              color: P.ink,
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  borderBottom: `1px solid ${P.line}`,
                }}
              >
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Email</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Role</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>
                  Auth user
                </th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Profile</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Group</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>
                  Group role
                </th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {(status?.summary ?? []).map((row) => (
                <tr
                  key={row.key}
                  style={{ borderBottom: `1px solid ${P.line2}` }}
                >
                  <td style={{ padding: "8px 6px" }}>{row.email}</td>
                  <td style={{ padding: "8px 6px" }}>{row.role}</td>
                  <td style={{ padding: "8px 6px" }}>
                    <StatePill state={row.authUser} />
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <StatePill state={row.profile} />
                  </td>
                  <td style={{ padding: "8px 6px" }}>{row.groupName ?? "—"}</td>
                  <td style={{ padding: "8px 6px" }}>
                    <StatePill state={row.groupAssignment} />
                  </td>
                  <td style={{ padding: "8px 6px", color: P.ink2 }}>
                    {row.skipReason ?? ""}
                  </td>
                </tr>
              ))}
              {(status?.summary ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: "12px 6px", color: P.ink3 }}
                  >
                    No status yet. Click Refresh status to load.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {status?.diagnostics ? (
          <div
            role="region"
            aria-label="Edge Function diagnostics"
            style={{
              background: P.surface,
              border: `1px solid ${P.line}`,
              borderRadius: 8,
              padding: "12px 14px",
              fontFamily: fontSans,
              fontSize: 13,
              color: P.ink,
              display: "grid",
              gap: 10,
            }}
          >
            <strong style={{ fontSize: 13 }}>Edge Function diagnostics</strong>
            <div
              style={{
                display: "grid",
                gap: 4,
                fontFamily: fontSans,
                fontSize: 12,
              }}
            >
              <div>
                Caller auth user id:{" "}
                <code
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                >
                  {status.diagnostics.callerAuthUserId ?? "(none)"}
                </code>
              </div>
              <div>
                Profile query succeeded:{" "}
                <strong>
                  {status.diagnostics.profileLookup.succeeded ? "yes" : "no"}
                </strong>
              </div>
              <div>
                Profile row count:{" "}
                <strong>{status.diagnostics.profileLookup.rowCount}</strong>
              </div>
              {status.diagnostics.profileLookup.profile ? (
                <div>
                  Profile: email=
                  <code>
                    {status.diagnostics.profileLookup.profile.email ?? "(null)"}
                  </code>{" "}
                  role=
                  <code>
                    {status.diagnostics.profileLookup.profile.role ?? "(null)"}
                  </code>{" "}
                  status=
                  <code>
                    {status.diagnostics.profileLookup.profile.status ??
                      "(null)"}
                  </code>
                </div>
              ) : null}
              {status.diagnostics.profileLookup.postgrestError ? (
                <div
                  style={{
                    background: P.terraSoft,
                    border: `1px solid ${P.terra}`,
                    borderRadius: 6,
                    padding: "8px 10px",
                    color: "#7d3621",
                    display: "grid",
                    gap: 2,
                  }}
                >
                  <div>
                    <strong>PostgREST error</strong>
                  </div>
                  {status.diagnostics.profileLookup.postgrestError.code ? (
                    <div>
                      code:{" "}
                      <code>
                        {status.diagnostics.profileLookup.postgrestError.code}
                      </code>
                    </div>
                  ) : null}
                  {status.diagnostics.profileLookup.postgrestError.message ? (
                    <div>
                      message:{" "}
                      {status.diagnostics.profileLookup.postgrestError.message}
                    </div>
                  ) : null}
                  {status.diagnostics.profileLookup.postgrestError.details ? (
                    <div>
                      details:{" "}
                      {status.diagnostics.profileLookup.postgrestError.details}
                    </div>
                  ) : null}
                  {status.diagnostics.profileLookup.postgrestError.hint ? (
                    <div>
                      hint:{" "}
                      {status.diagnostics.profileLookup.postgrestError.hint}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div>
              <strong style={{ fontSize: 12 }}>
                Env presence (names only)
              </strong>
              <ul
                style={{
                  margin: "4px 0 0 18px",
                  padding: 0,
                  fontFamily: fontSans,
                  fontSize: 12,
                }}
              >
                {Object.entries(status.diagnostics.envPresent).map(
                  ([name, present]) => (
                    <li key={name}>
                      <code>{name}</code>:{" "}
                      <span style={{ color: present ? P.sage : P.terra }}>
                        {present ? "set" : "missing"}
                      </span>
                    </li>
                  )
                )}
              </ul>
            </div>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div
            role="status"
            style={{
              background: P.mustardSoft,
              border: `1px solid ${P.mustard}`,
              borderRadius: 8,
              padding: "10px 12px",
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink,
            }}
          >
            <strong>Warnings:</strong>
            <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {errors.length > 0 ? (
          <div
            role="alert"
            style={{
              background: P.terraSoft,
              border: `1px solid ${P.terra}`,
              borderRadius: 8,
              padding: "12px 14px",
              fontFamily: fontBody,
              fontSize: 13,
              color: "#7d3621",
              display: "grid",
              gap: 8,
            }}
          >
            <strong>Test account check is blocked</strong>
            <ul
              style={{
                margin: 0,
                padding: "0 0 0 18px",
                display: "grid",
                gap: 2,
              }}
            >
              {/* One plain-language line per distinct problem; identical raw
                  errors that translate to the same message collapse to one. */}
              {[...new Set(errors.map(translateTestAccountError))].map(
                (msg) => (
                  <li key={msg}>{msg}</li>
                )
              )}
            </ul>
            <p style={{ margin: 0 }}>
              Next step: run <strong>Diagnose</strong> above for a deeper check,
              then review the test accounts table.
            </p>
            <details>
              <summary
                className="lg-sac-summary"
                style={{ fontFamily: fontSans, fontSize: 12, fontWeight: 600 }}
              >
                Details
              </summary>
              <ul
                style={{
                  margin: "6px 0 0",
                  padding: "0 0 0 18px",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12,
                  display: "grid",
                  gap: 2,
                }}
              >
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          </div>
        ) : null}
      </div>
    </section>
  );
}
