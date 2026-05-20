"use client";

import { useCallback, useState, useTransition } from "react";
import { SectionHeader } from "@/components/layout/shell";
import { PButton } from "@/components/pastoral/button";
import {
  Card,
  StatusDot,
  type StatusDotTone,
} from "@/components/pastoral/primitives";
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

// State labels coming back from the Edge Function are mapped onto the
// shared StatusDot tones so every operational row in the console reads
// from the same color vocabulary.
const STATE_TONE: Record<string, { tone: StatusDotTone; label: string }> = {
  exists: { tone: "sage", label: "exists" },
  active: { tone: "sage", label: "active" },
  created: { tone: "sage", label: "created" },
  updated: { tone: "sage", label: "updated" },
  added: { tone: "sage", label: "added" },
  archived: { tone: "neutral", label: "archived" },
  missing: { tone: "clay", label: "missing" },
  deleted: { tone: "neutral", label: "deleted" },
  inactive: { tone: "neutral", label: "inactive" },
  deactivated: { tone: "neutral", label: "deactivated" },
  none: { tone: "neutral", label: "none" },
  skipped: { tone: "amber", label: "skipped" },
};

function StatePill({ state }: { state: string }) {
  const cfg = STATE_TONE[state] ?? { tone: "neutral" as const, label: state };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-body)",
        fontSize: 12.5,
        color: "var(--c-ink)",
      }}
    >
      <StatusDot tone={cfg.tone} />
      {cfg.label}
    </span>
  );
}

export function TestAccountsPanel({ initialStatus, initialErrors }: Props) {
  const [status, setStatus] = useState<TestAccountsResponse | null>(initialStatus);
  const [errors, setErrors] = useState<string[]>(initialErrors);
  const [warnings, setWarnings] = useState<string[]>(initialStatus?.warnings ?? []);
  const [pending, setPending] = useState<Pending>(null);
  const [, startTransition] = useTransition();

  const run = useCallback(
    (action: "status" | "enable" | "disable" | "diagnose", confirmText: string | null) => {
      if (confirmText && !window.confirm(confirmText)) return;
      const tag: Pending =
        action === "status" ? "refresh"
        : action === "diagnose" ? "diagnose"
        : action;
      setPending(tag);
      setErrors([]);
      setWarnings([]);
      startTransition(async () => {
        const result =
          action === "status" ? await testAccountsStatus()
          : action === "enable" ? await testAccountsEnable()
          : action === "disable" ? await testAccountsDisable()
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
    [],
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
      "Disable all known test accounts? Their logins will stop working immediately.",
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
          background: "var(--c-amberSoft)",
          border: "1px solid var(--c-amber)",
          borderRadius: 10,
          padding: "10px 14px",
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--c-amberDeep)",
        }}
      >
        These are real user accounts that sign in through the normal /login page.
        Passwords live only in the Edge Function environment — never displayed here.
      </div>

      <Card padded={false} style={{ padding: "18px 20px", display: "grid", gap: 14 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "center",
            justifyContent: "space-between",
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            color: "var(--c-ink2)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 18,
              rowGap: 8,
              alignItems: "center",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--c-ink3)" }}>Overall</span>
              <StatePill state={status?.enabledOverall ? "active" : "missing"} />
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--c-ink3)" }}>Database</span>
              <span style={{ color: "var(--c-ink)" }}>
                {status?.isRemoteSupabase === undefined
                  ? "unknown"
                  : status.isRemoteSupabase
                    ? "remote"
                    : "local"}
              </span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--c-ink3)" }}>Group A</span>
              <StatePill state={status?.groups?.a ?? "missing"} />
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--c-ink3)" }}>Group B</span>
              <StatePill state={status?.groups?.b ?? "missing"} />
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
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--c-ink)",
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid var(--c-line)",
                  color: "var(--c-ink3)",
                  fontSize: 11,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Email</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Role</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Auth user</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Profile</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Group</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Group role</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {(status?.summary ?? []).map((row) => (
                <tr
                  key={row.key}
                  style={{ borderBottom: "1px solid var(--c-lineSoft)" }}
                >
                  <td style={{ padding: "10px 6px" }}>{row.email}</td>
                  <td style={{ padding: "10px 6px" }}>{row.role}</td>
                  <td style={{ padding: "10px 6px" }}>
                    <StatePill state={row.authUser} />
                  </td>
                  <td style={{ padding: "10px 6px" }}>
                    <StatePill state={row.profile} />
                  </td>
                  <td style={{ padding: "10px 6px" }}>{row.groupName ?? "—"}</td>
                  <td style={{ padding: "10px 6px" }}>
                    <StatePill state={row.groupAssignment} />
                  </td>
                  <td style={{ padding: "10px 6px", color: "var(--c-ink2)" }}>
                    {row.skipReason ?? ""}
                  </td>
                </tr>
              ))}
              {(status?.summary ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "14px 6px", color: "var(--c-ink3)" }}>
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
              background: "var(--c-surfaceAlt)",
              border: "1px solid var(--c-lineSoft)",
              borderRadius: 10,
              padding: "12px 14px",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--c-ink)",
              display: "grid",
              gap: 10,
            }}
          >
            <strong style={{ fontSize: 13 }}>Edge Function diagnostics</strong>
            <div style={{ display: "grid", gap: 4, fontFamily: "var(--font-body)", fontSize: 12 }}>
              <div>
                Caller auth user id:{" "}
                <code style={{ fontFamily: "var(--font-mono)" }}>
                  {status.diagnostics.callerAuthUserId ?? "(none)"}
                </code>
              </div>
              <div>
                Profile query succeeded:{" "}
                <strong>{status.diagnostics.profileLookup.succeeded ? "yes" : "no"}</strong>
              </div>
              <div>
                Profile row count:{" "}
                <strong>{status.diagnostics.profileLookup.rowCount}</strong>
              </div>
              {status.diagnostics.profileLookup.profile ? (
                <div>
                  Profile: email=
                  <code>{status.diagnostics.profileLookup.profile.email ?? "(null)"}</code>
                  {" "}role=
                  <code>{status.diagnostics.profileLookup.profile.role ?? "(null)"}</code>
                  {" "}status=
                  <code>{status.diagnostics.profileLookup.profile.status ?? "(null)"}</code>
                </div>
              ) : null}
              {status.diagnostics.profileLookup.postgrestError ? (
                <div
                  style={{
                    background: "var(--c-claySoft)",
                    border: "1px solid var(--c-clay)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    color: "var(--c-clay)",
                    display: "grid",
                    gap: 2,
                  }}
                >
                  <div><strong>PostgREST error</strong></div>
                  {status.diagnostics.profileLookup.postgrestError.code ? (
                    <div>code: <code>{status.diagnostics.profileLookup.postgrestError.code}</code></div>
                  ) : null}
                  {status.diagnostics.profileLookup.postgrestError.message ? (
                    <div>message: {status.diagnostics.profileLookup.postgrestError.message}</div>
                  ) : null}
                  {status.diagnostics.profileLookup.postgrestError.details ? (
                    <div>details: {status.diagnostics.profileLookup.postgrestError.details}</div>
                  ) : null}
                  {status.diagnostics.profileLookup.postgrestError.hint ? (
                    <div>hint: {status.diagnostics.profileLookup.postgrestError.hint}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div>
              <strong style={{ fontSize: 12 }}>Env presence (names only)</strong>
              <ul
                style={{
                  margin: "4px 0 0 18px",
                  padding: 0,
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                }}
              >
                {Object.entries(status.diagnostics.envPresent).map(([name, present]) => (
                  <li key={name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <StatusDot tone={present ? "sage" : "clay"} />
                    <code>{name}</code>
                    <span style={{ color: "var(--c-ink3)" }}>
                      {present ? "set" : "missing"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div
            role="status"
            style={{
              background: "var(--c-amberSoft)",
              border: "1px solid var(--c-amber)",
              borderRadius: 10,
              padding: "10px 12px",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--c-amberDeep)",
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
              background: "var(--c-claySoft)",
              border: "1px solid var(--c-clay)",
              borderRadius: 10,
              padding: "10px 12px",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--c-clay)",
            }}
          >
            <strong>Errors:</strong>
            <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
