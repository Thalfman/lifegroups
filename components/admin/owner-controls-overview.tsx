import { Card } from "@/components/pastoral/primitives";

const pillars = [
  {
    title: "Audit log",
    body: "Every admin and leader write — create, assign, deactivate, close, reopen, check-in, role change — is recorded here, newest first. RLS restricts reads to super_admin alone.",
  },
  {
    title: "Role management",
    body: "The only place to change a profile's role. The super_admin role itself can't be assigned from the app (bootstrap procedure), and you can't change your own role.",
  },
  {
    title: "System status",
    body: "A short checklist that surfaces whether the underlying data and audit access are in place. Useful after a fresh deploy or a seed.",
  },
];

export function OwnerControlsOverview() {
  return (
    <Card padded={false} style={{ padding: "18px 20px" }}>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          letterSpacing: 1.8,
          textTransform: "uppercase",
          color: "var(--c-ink3)",
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        What lives here
      </div>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13.5,
          color: "var(--c-ink2)",
          lineHeight: 1.55,
          margin: "0 0 14px",
        }}
      >
        A quiet console for the one owner/operator account. Everyone else — ministry admins,
        leaders, co-leaders — runs their day-to-day from /admin and /leader; nothing here is
        needed for routine ministry work.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 14,
        }}
        className="lg-m-grid-stack"
      >
        {pillars.map((pillar) => (
          <div
            key={pillar.title}
            style={{
              background: "var(--c-surfaceAlt)",
              border: "1px solid var(--c-lineSoft)",
              borderRadius: 10,
              padding: "12px 14px",
              display: "grid",
              gap: 6,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 15,
                fontWeight: 500,
                color: "var(--c-ink)",
                letterSpacing: -0.2,
              }}
            >
              {pillar.title}
            </div>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 12.5,
                color: "var(--c-ink2)",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {pillar.body}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
