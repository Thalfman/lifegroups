import { SectionHeader } from "@/components/layout/shell";
import { P, fontBody } from "@/lib/pastoral";

export function StaffViewDeprecatedNote() {
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="Deprecated"
        title="Staff View"
        description="Kept here for the record so nothing about the change is hidden."
      />
      <div
        style={{
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderLeft: `3px solid ${P.mustard}`,
          borderRadius: 8,
          padding: "16px 20px",
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          lineHeight: 1.55,
          display: "grid",
          gap: 8,
        }}
      >
        <p style={{ margin: 0 }}>
          The Staff View product surface (the old <code>/staff</code> route)
          was removed in the Phase 5B.0 post-merge cleanup. The
          <code> staff_viewer</code> value remains in the Postgres
          <code> user_role</code> enum and the TypeScript union for
          backwards compatibility with any existing rows; nothing about
          the database changed.
        </p>
        <p style={{ margin: 0 }}>
          Any profile still set to <code>staff_viewer</code> is routed to{" "}
          <code>/unauthorized</code> on sign-in until it&rsquo;s reassigned to
          an active role through the role-management form above. No new
          Staff workflow is planned.
        </p>
      </div>
    </section>
  );
}
