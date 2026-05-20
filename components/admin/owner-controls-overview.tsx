import { SectionHeader } from "@/components/layout/shell";
import { P, fontBody } from "@/lib/pastoral";

export function OwnerControlsOverview() {
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="Owner controls"
        title="What lives here"
        description="A quiet console for the one owner/operator account. Everyone else &mdash; ministry admins, leaders, co-leaders &mdash; runs their day-to-day from /admin and /leader; nothing here is needed for routine ministry work."
      />
      <div
        style={{
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderRadius: 10,
          padding: "18px 22px",
          display: "grid",
          gap: 10,
          fontFamily: fontBody,
          fontSize: 14,
          color: P.ink2,
          lineHeight: 1.55,
        }}
      >
        <p style={{ margin: 0 }}>
          <strong style={{ color: P.ink }}>Audit log.</strong> Every admin
          and leader write &mdash; create, assign, deactivate, close, reopen,
          check-in, role change &mdash; is recorded here, newest first. RLS
          restricts reads to super_admin alone.
        </p>
        <p style={{ margin: 0 }}>
          <strong style={{ color: P.ink }}>Role management.</strong> The
          only place to change a profile&rsquo;s role. The super_admin role
          itself can&rsquo;t be assigned from the app (bootstrap procedure),
          and you can&rsquo;t change your own role.
        </p>
        <p style={{ margin: 0 }}>
          <strong style={{ color: P.ink }}>System status.</strong> A short
          checklist that surfaces whether the underlying data and audit
          access are in place. Useful after a fresh deploy or a seed.
        </p>
      </div>
    </section>
  );
}
