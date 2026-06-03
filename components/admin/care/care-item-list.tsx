import Link from "next/link";
import type { CSSProperties } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { CareItem, CareItemDueTone } from "@/lib/admin/care-area";

// One care item rendered with the reduction-plan six-field structure (#301):
// Person, Reason, Related group, Due date, Owner, Action. The action is an
// explicit verb (Log contact / View follow-up / Add note …) — never a vague
// Open / Manage / Update — and links into the per-leader detail page where the
// work actually happens.

const DUE_TONE: Record<
  CareItemDueTone,
  { bg: string; fg: string; border: string }
> = {
  overdue: { bg: P.terraSoft, fg: "#923220", border: "#e4b9a8" },
  soon: { bg: P.mustardSoft, fg: P.mustardTextStrong, border: "#efdfa3" },
  neutral: { bg: P.bg, fg: P.ink3, border: P.line },
};

const ROW: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  padding: "14px 0",
  borderBottom: `1px solid ${P.line2}`,
};

const META: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "center",
  marginTop: 6,
  fontFamily: fontBody,
  fontSize: 12,
  color: P.ink3,
};

function MetaBit({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span
        style={{
          fontFamily: fontSans,
          fontSize: 9.5,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          fontWeight: 700,
          color: P.ink3,
          marginRight: 5,
        }}
      >
        {label}
      </span>
      <span style={{ color: P.ink2 }}>{value}</span>
    </span>
  );
}

export function CareItemList({
  items,
  emptyTitle,
  emptyDescription,
}: {
  items: CareItem[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (items.length === 0) {
    return (
      <div
        style={{
          background: P.surface,
          border: `1px dashed ${P.line}`,
          borderRadius: 14,
          padding: "32px 18px",
          textAlign: "center",
          display: "grid",
          gap: 6,
          justifyItems: "center",
        }}
      >
        <div style={{ fontFamily: fontBody, fontWeight: 600, color: P.ink }}>
          {emptyTitle}
        </div>
        <div style={{ fontFamily: fontBody, fontSize: 13, color: P.ink3 }}>
          {emptyDescription}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: "4px 18px",
      }}
    >
      {items.map((item) => {
        const tone = DUE_TONE[item.dueTone];
        return (
          <div key={item.key} style={ROW}>
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
                {item.personName}
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
                {item.reason}
              </div>
              <div style={META}>
                <MetaBit label="Group" value={item.groupName ?? "—"} />
                <MetaBit
                  label="Owner"
                  value={
                    item.ownerName
                      ? `Assigned to ${item.ownerName}`
                      : "Unassigned"
                  }
                />
                {item.dueLabel ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "1px 9px",
                      borderRadius: 999,
                      fontFamily: fontSans,
                      fontSize: 11,
                      fontWeight: 600,
                      background: tone.bg,
                      color: tone.fg,
                      border: `1px solid ${tone.border}`,
                    }}
                  >
                    {item.dueLabel}
                  </span>
                ) : null}
              </div>
            </div>
            <Link
              href={item.actionHref}
              style={{
                flexShrink: 0,
                alignSelf: "center",
                fontFamily: fontSans,
                fontSize: 12.5,
                fontWeight: 600,
                color: P.sageTextStrong,
                textDecoration: "none",
                border: `1px solid ${P.line}`,
                borderRadius: 999,
                padding: "7px 14px",
                whiteSpace: "nowrap",
              }}
            >
              {item.actionLabel} →
            </Link>
          </div>
        );
      })}
    </div>
  );
}
