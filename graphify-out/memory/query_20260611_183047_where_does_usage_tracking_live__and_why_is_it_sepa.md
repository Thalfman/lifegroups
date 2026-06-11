---
type: "query"
date: "2026-06-11T18:30:47.845568+00:00"
question: "Where does usage tracking live, and why is it separate from the audit trail?"
contributor: "graphify"
source_nodes: ["UsagePanel()", "UsageBeacon()", "recordAreaView()", "AuditWorkspacePanel()"]
---

# Q: Where does usage tracking live, and why is it separate from the audit trail?

## Answer

Usage tracking already exists (Phase USAGE.1, migration 20260628000000_phase_usage_tracking.sql). It writes to its own append-only usage_events table via the log_usage_event SECURITY DEFINER RPC — deliberately NOT audit_events, because high-frequency telemetry would drown the audit log and audit_events is ministry_admin-readable while usage data is Super-Admin-only. Recording is gated server-side by the usage_tracking feature flag (default off) in platform_config. The UI is the 'Usage & logins' UsagePanel inside the Diagnostics workspace of the super-admin console (super-admin-console-shell.tsx), one workspace tab before Audit. Client glue: UsageBeacon in app/(protected)/layout.tsx fires recordAreaView (lib/usage/actions.ts) on area entry; login events come from app/login/actions.ts.

## Source Nodes

- UsagePanel()
- UsageBeacon()
- recordAreaView()
- AuditWorkspacePanel()