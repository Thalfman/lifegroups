"use client";

import { useCallback, useState, useTransition } from "react";
import { SectionHeader } from "@/components/layout/shell";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

// Status-dot vocabulary: sage = present/healthy, quiet ink = absent on
// purpose, rose = missing (concern), amber = skipped (watch).
const STATE_DOT: Record<string, { dot: string; label: string }> = {
  exists: { dot: "bg-sage", label: "exists" },
  active: { dot: "bg-sage", label: "active" },
  created: { dot: "bg-sage", label: "created" },
  updated: { dot: "bg-sage", label: "updated" },
  added: { dot: "bg-sage", label: "added" },
  archived: { dot: "bg-ink3", label: "archived" },
  missing: { dot: "bg-rose", label: "missing" },
  deleted: { dot: "bg-ink3", label: "deleted" },
  inactive: { dot: "bg-ink3", label: "inactive" },
  deactivated: { dot: "bg-ink3", label: "deactivated" },
  none: { dot: "bg-ink3", label: "none" },
  skipped: { dot: "bg-amber", label: "skipped" },
};

// Friendly nouns for the table names that show up in raw Edge Function
// lookup errors (e.g. "group_leaders lookup failed: …").
const LOOKUP_SUBJECT_LABELS: Record<string, string> = {
  group_leaders: "group shepherd",
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
  const cfg = STATE_DOT[state] ?? { dot: "bg-ink3", label: state };
  return (
    <span className="inline-flex items-center gap-1.5 font-sans text-xs text-ink">
      <span
        aria-hidden
        className={cn("inline-block h-2 w-2 rounded-pill", cfg.dot)}
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
    (action: "status" | "enable" | "disable" | "diagnose") => {
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
        // The actions normally return a discriminated result, but a thrown
        // rejection (network drop, unexpected server error) would otherwise
        // skip setPending(null) and wedge every trigger in its disabled state.
        try {
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
        } catch (err) {
          setErrors([err instanceof Error ? err.message : String(err)]);
        } finally {
          setPending(null);
        }
      });
    },
    []
  );

  // The two impacting actions confirm through the non-blocking dialog (#666),
  // not a synchronous `window.confirm`: the click opens the dialog and paints
  // immediately, and the action fires from its confirm button. The enable copy
  // shouts louder when the target is a REMOTE database.
  const enableConfirmMessage =
    status?.isRemoteSupabase === true
      ? "You are about to enable test login accounts on a REMOTE database. These accounts have known passwords. Proceed?"
      : "Enable test login accounts? Their passwords are known to anyone with the env file.";
  const disableConfirmMessage =
    "Disable all known test accounts? Their logins will stop working immediately.";

  const handleRefresh = useCallback(() => {
    run("status");
  }, [run]);

  const handleDiagnose = useCallback(() => {
    run("diagnose");
  }, [run]);

  return (
    <section className="grid gap-4">
      <SectionHeader
        eyebrow="Test accounts"
        title="Temporary login accounts for role and mobile testing"
        description="Use these temporary accounts for role and mobile testing. Disable them before launch — known-password accounts must not remain active for production."
      />

      <div
        role="note"
        className="rounded-sm border border-amber bg-amberSoft px-3.5 py-2.5 font-sans text-sm text-ink"
      >
        These are real user accounts that sign in through the normal /login
        page. Passwords live only in the Edge Function environment — never
        displayed here.
      </div>

      <div className="grid gap-3.5 rounded-lg border border-line bg-surface p-card">
        <div className="flex flex-wrap items-center justify-between gap-4 font-sans text-xs text-ink2">
          <div className="flex flex-wrap gap-4">
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
          {/* Safe reads and admin-impacting actions sit in separately labeled
              clusters so a glance tells them apart (#458). Enable/disable keep
              their confirmation gates (now the non-blocking dialog, #666) and
              gain the amber (impacting) treatment; the reads stay quiet ghost
              buttons. */}
          <div className="flex flex-wrap items-end gap-4">
            <div
              role="group"
              aria-label="Read-only checks"
              className="grid gap-1.5"
            >
              <span className="font-sans text-xs font-semibold text-ink3">
                Read-only
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={pending !== null}
                >
                  {pending === "refresh" ? "Refreshing…" : "Refresh status"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDiagnose}
                  disabled={pending !== null}
                >
                  {pending === "diagnose" ? "Diagnosing…" : "Diagnose"}
                </Button>
              </div>
            </div>
            <div
              role="group"
              aria-label="Admin-impacting actions"
              className="grid gap-1.5"
            >
              <span className="font-sans text-xs font-semibold text-amberText">
                Admin-impacting · asks before running
              </span>
              <div className="flex flex-wrap gap-2">
                <ConfirmDialog
                  trigger={
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={pending !== null}
                    >
                      {pending === "enable"
                        ? "Enabling…"
                        : "Enable test accounts"}
                    </Button>
                  }
                  title="Enable test accounts"
                  message={enableConfirmMessage}
                  confirmLabel="Enable test accounts"
                  confirmVariant="primary"
                  onConfirm={() => run("enable")}
                />
                <ConfirmDialog
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending !== null}
                      className="border-amber text-amberText"
                    >
                      {pending === "disable"
                        ? "Disabling…"
                        : "Disable test accounts"}
                    </Button>
                  }
                  title="Disable test accounts"
                  message={disableConfirmMessage}
                  confirmLabel="Disable test accounts"
                  confirmVariant="primary"
                  onConfirm={() => run("disable")}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-sans text-sm text-ink">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-1.5 py-2 text-xs font-semibold text-ink3">
                  Email
                </th>
                <th className="px-1.5 py-2 text-xs font-semibold text-ink3">
                  Role
                </th>
                <th className="px-1.5 py-2 text-xs font-semibold text-ink3">
                  Auth user
                </th>
                <th className="px-1.5 py-2 text-xs font-semibold text-ink3">
                  Profile
                </th>
                <th className="px-1.5 py-2 text-xs font-semibold text-ink3">
                  Group
                </th>
                <th className="px-1.5 py-2 text-xs font-semibold text-ink3">
                  Group role
                </th>
                <th className="px-1.5 py-2 text-xs font-semibold text-ink3">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {(status?.summary ?? []).map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-lineSoft hover:bg-surfaceAlt"
                >
                  <td className="px-1.5 py-2">{row.email}</td>
                  <td className="px-1.5 py-2">{row.role}</td>
                  <td className="px-1.5 py-2">
                    <StatePill state={row.authUser} />
                  </td>
                  <td className="px-1.5 py-2">
                    <StatePill state={row.profile} />
                  </td>
                  <td className="px-1.5 py-2">{row.groupName ?? "—"}</td>
                  <td className="px-1.5 py-2">
                    <StatePill state={row.groupAssignment} />
                  </td>
                  <td className="px-1.5 py-2 text-ink2">
                    {row.skipReason ?? ""}
                  </td>
                </tr>
              ))}
              {(status?.summary ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-1.5 py-3 text-ink3">
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
            className="grid gap-2.5 rounded-sm border border-line bg-surfaceAlt px-3.5 py-3 font-sans text-sm text-ink"
          >
            <strong className="text-sm">Edge Function diagnostics</strong>
            <div className="grid gap-1 font-sans text-xs">
              <div>
                Caller auth user id:{" "}
                <code className="font-mono">
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
                <div className="grid gap-0.5 rounded-sm border border-rose/40 bg-roseSoft px-2.5 py-2 text-rose">
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
              <strong className="text-xs">Env presence (names only)</strong>
              <ul className="mb-0 ml-0 mr-0 mt-1 list-disc p-0 pl-5 font-sans text-xs">
                {Object.entries(status.diagnostics.envPresent).map(
                  ([name, present]) => (
                    <li key={name}>
                      <code>{name}</code>:{" "}
                      <span
                        className={cn(present ? "text-sageDeep" : "text-rose")}
                      >
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
            className="rounded-sm border border-amber bg-amberSoft px-3 py-2.5 font-sans text-sm text-ink"
          >
            <strong>Warnings:</strong>
            <ul className="mb-0 ml-0 mr-0 mt-1.5 list-disc p-0 pl-5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {errors.length > 0 ? (
          <div
            role="alert"
            className="grid gap-2 rounded-sm border border-rose/40 bg-roseSoft px-3.5 py-3 font-sans text-sm text-rose"
          >
            <strong>Test account check is blocked</strong>
            <ul className="m-0 grid list-disc gap-0.5 p-0 pl-5">
              {/* One plain-language line per distinct problem; identical raw
                  errors that translate to the same message collapse to one. */}
              {[...new Set(errors.map(translateTestAccountError))].map(
                (msg) => (
                  <li key={msg}>{msg}</li>
                )
              )}
            </ul>
            <p className="m-0">
              Next step: run <strong>Diagnose</strong> above for a deeper check,
              then review the test accounts table.
            </p>
            <details>
              <summary className="lg-sac-summary font-sans text-xs font-semibold">
                Details
              </summary>
              <ul className="mb-0 ml-0 mr-0 mt-1.5 grid list-disc gap-0.5 p-0 pl-5 font-mono text-xs">
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
