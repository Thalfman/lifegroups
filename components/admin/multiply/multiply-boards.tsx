import { P, fontDisplay, fontBody, fontMono } from "@/lib/pastoral";
import type { PillarKey } from "@/lib/admin/multiplication-pillars";
import type { TypeBoard } from "./multiply-data";

// Presentational Multiply boards (#380): three type boards, each showing the four
// pillar A–F values (health pillars show "—" until grades exist), the per-type
// trigger/multiply signal (NO blended overall letter), and the individual-group
// multiply flag raised from the Capacity input. Server component, pure render.

const PILLAR_ORDER: { key: PillarKey; label: string; hint: string }[] = [
  { key: "capacity", label: "Capacity", hint: "Ministry-Admin fed, per type" },
  { key: "interest", label: "Interest", hint: "from the Interest Funnel" },
  { key: "groupHealth", label: "Group Health", hint: "ministry-year roll-up" },
  {
    key: "leaderHealth",
    label: "Leader Health",
    hint: "ministry-year roll-up",
  },
];

const PILLAR_LABEL: Record<PillarKey, string> = {
  capacity: "Capacity",
  interest: "Interest",
  groupHealth: "Group Health",
  leaderHealth: "Leader Health",
};

function letterColor(letter: string | null): string {
  switch (letter) {
    case "A":
    case "B":
      return P.sageTextStrong;
    case "C":
      return P.mustardTextStrong;
    case "D":
    case "F":
      return P.terraTextStrong;
    default:
      return P.ink3;
  }
}

function PillarCell({
  label,
  hint,
  letter,
}: {
  label: string;
  hint: string;
  letter: string | null;
}) {
  return (
    <div
      style={{
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        background: P.bg,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span style={{ fontFamily: fontBody, fontSize: 13, color: P.ink2 }}>
        {label}
      </span>
      <span
        aria-label={`${label} grade ${letter ?? "not yet graded"}`}
        style={{
          fontFamily: fontDisplay,
          fontSize: 32,
          lineHeight: 1,
          color: letterColor(letter),
        }}
      >
        {letter ?? "—"}
      </span>
      <span style={{ fontFamily: fontBody, fontSize: 11, color: P.ink3 }}>
        {hint}
      </span>
    </div>
  );
}

function SignalBadge({ ready }: { ready: boolean }) {
  return (
    <span
      style={{
        fontFamily: fontBody,
        fontSize: 13,
        fontWeight: 600,
        padding: "4px 12px",
        borderRadius: 999,
        background: ready ? P.sageSoft : P.bgDeep,
        color: ready ? P.sageTextStrong : P.ink2,
        border: `1px solid ${ready ? P.sage : P.line}`,
      }}
    >
      {ready ? "Ready to multiply this type" : "Not ready yet"}
    </span>
  );
}

function BoardCard({ board }: { board: TypeBoard }) {
  const blockerLabels = board.signal.blockers
    .map((b) => PILLAR_LABEL[b])
    .join(", ");

  return (
    <section
      style={{
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        background: P.surface,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: fontDisplay,
            fontSize: 22,
            color: P.ink,
          }}
        >
          {board.label}
        </h3>
        <SignalBadge ready={board.signal.ready} />
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {PILLAR_ORDER.map((p) => (
          <PillarCell
            key={p.key}
            label={p.label}
            hint={p.hint}
            letter={board.pillars[p.key]}
          />
        ))}
      </div>

      {!board.signal.ready && board.signal.blockers.length > 0 && (
        <p
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
          }}
        >
          Held back by: {blockerLabels}.
        </p>
      )}

      {board.individualFlag.flagged && (
        <p
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 13,
            color: P.terraTextStrong,
            background: P.terraSoft,
            border: `1px solid ${P.terra}`,
            borderRadius: 8,
            padding: "8px 12px",
          }}
        >
          {board.individualFlag.fullGroupCount === 1
            ? "1 group of this type is full — flag it to multiply on its own."
            : `${board.individualFlag.fullGroupCount} groups of this type are full — flag them to multiply on their own.`}
        </p>
      )}

      <footer
        style={{
          fontFamily: fontMono,
          fontSize: 11,
          color: P.ink3,
          borderTop: `1px solid ${P.line2}`,
          paddingTop: 8,
        }}
      >
        Funnel volume {board.funnelVolume}
        {board.usingDefaults
          ? " · using built-in thresholds (not yet configured)"
          : ""}
      </footer>
    </section>
  );
}

export function MultiplyBoards({
  boards,
  ministryYear,
}: {
  boards: TypeBoard[];
  ministryYear: number;
}) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <p
        style={{ margin: 0, fontFamily: fontBody, fontSize: 13, color: P.ink2 }}
      >
        Ministry year {ministryYear}–{ministryYear + 1}. Each type is graded on
        four pillars; a configurable trigger over those pillars — not a blended
        letter — says when a type is ready to multiply.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
        }}
      >
        {boards.map((board) => (
          <BoardCard key={board.type} board={board} />
        ))}
      </div>
    </div>
  );
}
