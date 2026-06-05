import { LgAppShell } from "@/components/lg/shell/LgAppShell";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { requireLeader } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Leader landing — minimal auth-only placeholder (#376, ADR 0017).
//
// The Leader surface is re-opening under the verify-before-flip gate, but the
// care surface itself (the per-member Care space) lands in #382. Until then a
// logged-in leader sees ONLY this "your care space is coming" placeholder, in
// the style of the Plan/Multiply AreaPlaceholder shells. It deliberately has NO
// check-in entry points: check-ins stay frozen behind their own `check_ins`
// gate (decoupled from leader_surface, #376 criterion 2), so nothing here links
// to /leader/[groupId]/checkin or renders group dashboards / quick-check-in
// actions. The guard (requireLeader) admits a leader only when leader_surface
// is enabled-and-verified; this page is pure chrome behind it.
export default async function LeaderPage() {
  const session = await requireLeader();
  const user = {
    name: session.profile.full_name,
    email: session.profile.email,
    role: session.profile.role,
  };
  const MAX_WIDTH = 720;

  return (
    <LgAppShell user={user}>
      <PageHeader
        eyebrow="Care"
        title="Your care"
        italic="space"
        lede="A place to care for the people in your group."
        maxWidth={MAX_WIDTH}
      />
      <PageBody maxWidth={MAX_WIDTH}>
        <div
          role="status"
          style={{
            border: "1px solid var(--c-line)",
            background: "var(--c-surface)",
            borderRadius: 12,
            padding: "28px 26px",
            maxWidth: 560,
            fontFamily: "var(--font-body)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "var(--c-clay)",
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            Being built
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.55,
              color: "var(--c-ink2)",
            }}
          >
            Your care space is coming. Soon you&rsquo;ll see the people in your
            group here, with a quiet place to note how each of them is doing.
            Nothing for you to do yet &mdash; we&rsquo;ll let you know when
            it&rsquo;s ready.
          </p>
        </div>
      </PageBody>
    </LgAppShell>
  );
}
