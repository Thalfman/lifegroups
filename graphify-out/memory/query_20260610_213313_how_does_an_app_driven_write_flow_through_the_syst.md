---
type: "query"
date: "2026-06-10T21:33:13.836843+00:00"
question: "How does an app-driven write flow through the system?"
contributor: "graphify"
source_nodes: ["runAdminWriteAction()", "run-action.ts", "rpc.ts", "AdminWriteActionSpec"]
---

# Q: How does an app-driven write flow through the system?

## Answer

Every app-driven write follows a fixed pipeline: validate -> guard -> SECURITY DEFINER RPC -> revalidatePath -> log. Server Actions (app/**/actions.ts) never write tables directly; they call a narrow SECURITY DEFINER RPC (the admin_* / leader_* / over_shepherd_* / super_admin_* families, plus purpose-named ones like set_note_transparency_grant) through typed wrappers in lib/**/rpc.ts, and each RPC writes a paired audit_events row in the same transaction. The shared skeleton is the Write Action Runner (ADR 0001/0005): per-surface adapters such as runAdminWriteAction() in lib/admin/run-action.ts supply only the pure bits - validator, auth gate, RPC call, structured-log fields, and revalidate paths. Guards come in two flavors: redirect-guards (requireAdmin, ...) for pages and result-returning guards (requireAdminSession, ...) for server actions. The service-role key never appears in Next runtime code; it is confined to Supabase Edge Functions.

## Source Nodes

- runAdminWriteAction()
- run-action.ts
- rpc.ts
- AdminWriteActionSpec