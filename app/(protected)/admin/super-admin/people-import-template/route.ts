// CSV import template download (PRD-SAC6 Feature 2, #289). Serves an empty,
// correctly-shaped CSV so a Super Admin can grab the exact header the bulk
// people-import parser expects, fill it in, and paste it straight back into the
// import form. Read-only: no DB, RPC, or audit.
//
// Header + role rules are the parser's source of truth (lib/admin/people-import
// .ts): columns full_name,email,phone,role; role ∈ {leader, member}; leaders
// require an email. One example row leads so the shape is obvious; pasted back
// unmodified it parses cleanly (the example leader is a valid row).
//
// Route handlers do NOT inherit the (protected) layout's guard, so the
// super-admin check is explicit here — a non-super-admin caller gets a 403.

import { requireSuperAdminSession } from "@/lib/auth/session";

const TEMPLATE_CSV = [
  "full_name,email,phone,role",
  "Jane Doe,jane@example.com,555-0100,leader",
].join("\n");

export async function GET(): Promise<Response> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(TEMPLATE_CSV, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="lifegroups-people-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
