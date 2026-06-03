import Link from "next/link";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { Card } from "@/components/lg/Card";
import { Icon, type IconName } from "@/components/lg/Icon";
import { requireAdmin } from "@/lib/auth/session";

// Planning area landing shell (ADR 0013, #298). Planning is the entry point for
// Job 2 — "what groups need to launch" — and replaces Launch Planning +
// Calendar as the top-level destination. This slice lands the shell only; the
// merged tabbed contents arrive in #303. Until then it links out to the
// surfaces it will host, whose frozen routes (/admin/launch-planning,
// /admin/calendar) keep their paths and resolve directly (ADR 0008/0009).
export const dynamic = "force-dynamic";

const PLANNING_SURFACES: {
  href: string;
  label: string;
  icon: IconName;
  desc: string;
}[] = [
  {
    href: "/admin/launch-planning",
    label: "Launch planning",
    icon: "compass",
    desc: "What groups need to launch, with capacity and multiplication.",
  },
  {
    href: "/admin/calendar",
    label: "Calendar",
    icon: "cal",
    desc: "The ministry-wide schedule of meetings and gatherings.",
  },
];

export default async function AdminPlanningPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        eyebrow="Planning"
        title="Launch"
        italic="planning"
        lede="What groups need to launch, in one place. Open a surface below — these will merge into tabs here in a later step."
      />
      <PageBody>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {PLANNING_SURFACES.map((s) => (
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
