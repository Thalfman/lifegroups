import Link from "next/link";
import type { CSSProperties } from "react";
import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type {
  CareAttentionItem,
  CareAttentionReason,
} from "@/lib/admin/shepherd-care-dashboard";

const REASON_LABEL: Record<CareAttentionReason, string> = {
  overdue_touchpoint: "Overdue",
  needs_attention_status: "Needs attention",
  no_contact_yet: "No contact",
  stale_last_contact: "Stale contact",
  no_over_shepherd: "No over-shepherd",
  watch_status: "Watch",
};

const REASON_TONE: Record<CareAttentionReason, { bg: string; fg: string; border: string }> = {
  overdue_touchpoint: { bg: P.terraSoft, fg: "#923220", border: "#e4b9a8" },
  needs_attention_status: { bg: P.terraSoft, fg: "#923220", border: "#e4b9a8" },
  no_contact_yet: { bg: P.mustardSoft, fg: P.mustardTextStrong, border: "#efdfa3" },
  stale_last_contact: { bg: P.mustardSoft, fg: P.mustardTextStrong, border: "#efdfa3" },
  no_over_shepherd: { bg: P.bgDeep, fg: P.ink2, border: P.line2 },
  watch_status: { bg: "#fff5d9", fg: "#6a4d11", border: "#efdfa3" },
};

const PRIMARY_BADGE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  fontFamily: fontSans,
};

const SECONDARY_CHIP: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "1px 8px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  fontFamily: fontSans,
  background: P.bg,
  color: P.ink3,
  border: `1px solid ${P.line}`,
};

const ROW_LINK: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  padding: "12px 0",
  borderBottom: `1px solid ${P.line2}`,
  textDecoration: "none",
  color: "inherit",
};

function ReasonBadge({ reason }: { reason: CareAttentionReason }) {
  const tone = REASON_TONE[reason];
  return (
    <span
      style={{
        ...PRIMARY_BADGE,
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.border}`,
      }}
    >
      {REASON_LABEL[reason]}
    </span>
  );
}

export function CareAttentionQueue({
  items,
  totalCount,
}: {
  items: CareAttentionItem[];
  totalCount: number;
}) {
  const remaining = totalCount - items.length;
  return (
    <StatusCard
      eyebrow="Triage queue"
      title="Needs attention this week"
      action={
        totalCount > 0 ? (
          <Link
            href="/admin/shepherd-care?filter=needs_attention"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            View all →
          </Link>
        ) : null
      }
    >
      {items.length === 0 ? (
        <EmptyState
          title="Nothing urgent right now"
          description="No shepherds match the attention rules today. Keep checking back as touchpoints come due."
        />
      ) : (
        <div>
          {items.map((item) => (
            <Link key={item.shepherdProfileId} href={item.href} style={ROW_LINK}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontFamily: fontSans,
                    fontSize: 14,
                    fontWeight: 600,
                    color: P.ink,
                    overflowWrap: "anywhere",
                  }}
                >
                  {item.shepherdName}
                </div>
                <div
                  style={{
                    fontFamily: fontBody,
                    fontSize: 12.5,
                    color: P.ink2,
                    marginTop: 2,
                    fontStyle: "italic",
                  }}
                >
                  {item.detail}
                </div>
                {item.secondaryReasons.length > 0 ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {item.secondaryReasons.map((r) => (
                      <span key={r} style={SECONDARY_CHIP}>
                        {REASON_LABEL[r]}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <ReasonBadge reason={item.reason} />
            </Link>
          ))}
          {remaining > 0 ? (
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 12,
                color: P.ink3,
                marginTop: 10,
                textAlign: "right",
              }}
            >
              <Link
                href="/admin/shepherd-care?filter=needs_attention"
                style={{ color: P.terra, textDecoration: "underline" }}
              >
                +{remaining} more
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </StatusCard>
  );
}
