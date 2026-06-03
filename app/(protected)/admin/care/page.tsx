import Link from "next/link";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { Card } from "@/components/lg/Card";
import { Icon, type IconName } from "@/components/lg/Icon";
import { requireAdmin } from "@/lib/auth/session";

// Care area landing shell (ADR 0013, #298). Care is the entry point for Job 1 —
// "how my leaders are doing" — and replaces Leader care + Follow-ups as the
// top-level destination. This slice lands the shell only; the merged tabbed
// contents arrive in #301. Until then it links out to the surfaces it will
// host, whose frozen routes (/admin/shepherd-care, /admin/follow-ups) keep
// their paths and resolve directly (ADR 0008/0009).
export const dynamic = "force-dynamic";

const CARE_SURFACES: {
  href: string;
  label: string;
  icon: IconName;
  desc: string;
}[] = [
  {
    href: "/admin/shepherd-care",
    label: "Leader care",
    icon: "heart",
    desc: "See how each leader is doing and who needs a touch.",
  },
  {
    href: "/admin/follow-ups",
    label: "Follow-ups",
    icon: "flag",
    desc: "The open task queue of leaders to check in with.",
  },
];

export default async function AdminCarePage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        eyebrow="Care"
        title="Leader"
        italic="care"
        lede="How your leaders are doing, in one place. Open a surface below — these will merge into tabs here in a later step."
      />
      <PageBody>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {CARE_SURFACES.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              style={{ textDecoration: "none", color: "var(--c-ink)" }}
            >
              <Card style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon name={s.icon} size={18} color="var(--c-sageDeep)" />
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 17,
                      fontWeight: 600,
                    }}
                  >
                    {s.label}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "var(--c-ink2)",
                  }}
                >
                  {s.desc}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}
