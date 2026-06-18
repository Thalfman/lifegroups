import { describe, expect, it } from "vitest";

import { auditInsertBlocks, writesAudit } from "../scan";

describe("auditInsertBlocks / writesAudit", () => {
  it("detects a paired audit_events insert", () => {
    const body =
      "insert into public.members (id) values (1);\n" +
      "insert into public.audit_events (action) values ('admin.do');";
    expect(writesAudit(body)).toBe(true);
    expect(auditInsertBlocks(body)).toHaveLength(1);
  });

  it("matches with no space before the column list", () => {
    expect(
      writesAudit("insert into public.audit_events(action) values ('x')")
    ).toBe(true);
  });

  it("does NOT count insert into public.audit_events_archive (different table)", () => {
    // The permanent-deletion archive copy starts with the same prefix; a
    // substring match would treat it as the accountability row. It must not.
    const archiveOnly =
      "insert into public.audit_events_archive\n" +
      "  select * from public.audit_events where created_at < v_cutoff;";
    expect(writesAudit(archiveOnly)).toBe(false);
    expect(auditInsertBlocks(archiveOnly)).toEqual([]);
  });

  it("counts the real audit insert even when an archive insert sits beside it", () => {
    // Mirrors super_admin_reset_audit_logs: an archive copy, then a delete, then
    // the real accountability row. Only the last is a public.audit_events insert.
    const body =
      "insert into public.audit_events_archive select * from public.audit_events;\n" +
      "delete from public.audit_events where created_at < v_cutoff;\n" +
      "insert into public.audit_events (action) values ('super_admin.reset_audit_logs');";
    const blocks = auditInsertBlocks(body);
    expect(blocks).toHaveLength(1); // the archive insert is NOT counted
    // (string contents are blanked by stripSqlStrings, so assert on structure)
    expect(blocks[0]).toContain("insert into public.audit_events (action)");
    expect(blocks[0]).not.toContain("archive");

    // Removing the real row leaves only the archive insert → no audit pairing.
    const archiveAndDeleteOnly =
      "insert into public.audit_events_archive select * from public.audit_events;\n" +
      "delete from public.audit_events where created_at < v_cutoff;";
    expect(writesAudit(archiveAndDeleteOnly)).toBe(false);
  });

  it("ignores an audit_events mention inside a string literal", () => {
    expect(
      writesAudit("raise notice 'would insert into public.audit_events';")
    ).toBe(false);
  });

  it("ignores an audit_events mention inside a dollar-quoted literal", () => {
    // A PL/pgSQL body can embed `$tag$ … $tag$`; a literal that names the audit
    // table must not be counted as a real paired insert.
    expect(
      writesAudit("raise notice $msg$insert into public.audit_events (x)$msg$;")
    ).toBe(false);
    expect(
      writesAudit(
        "update public.members set x = 1;\n" +
          "execute $sql$ insert into public.audit_events (a) values (1) $sql$;"
      )
    ).toBe(false);
  });

  it("still counts a real audit insert beside a dollar-quoted literal", () => {
    const body =
      "raise notice $msg$ wrote audit_events $msg$;\n" +
      "insert into public.audit_events (action) values ('x');";
    expect(writesAudit(body)).toBe(true);
  });
});
