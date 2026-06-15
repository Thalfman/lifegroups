import type { ProspectState } from "@/types/enums";
import { cn } from "@/lib/utils";
import { PROSPECT_STATE_LABEL } from "@/lib/admin/prospect-funnel";
import type { DueFollowUp } from "@/lib/admin/prospect-next-step";
import type { ProspectBoard as Board } from "@/lib/supabase/prospect-reads";
import { ProspectCard } from "@/components/admin/plan/prospect-card";
import type { PlanGroupOption } from "@/components/admin/plan/plan-data";
import { badgeDotClassName, STATUS_TONES } from "@/components/ui/badge";

// The four colour-coded funnel states (acceptance #2). Joined is sage but
// rendered as a collapsed roll-up below the active columns (acceptance #4), so
// only the three active states are live columns. Tone is carried by a leading
// status dot and the count's figure colour (never a stripe), both keyed to the
// shared status vocabulary: interested = watch, matched = info, joined = well,
// not_at_this_time = needs follow-up.
const STATE_TONES: Record<ProspectState, { dot: string; figure: string }> = {
  interested: {
    dot: badgeDotClassName(STATUS_TONES.watch),
    figure: "text-amberText",
  },
  matched: { dot: badgeDotClassName(STATUS_TONES.info), figure: "text-blue" },
  joined: {
    dot: badgeDotClassName(STATUS_TONES.well),
    figure: "text-sageDeep",
  },
  not_at_this_time: {
    dot: badgeDotClassName(STATUS_TONES.followUp),
    figure: "text-clayDeep",
  },
};

export function ProspectBoardView({
  board,
  groupNamesById,
  activeGroups,
  dueTasks,
}: {
  board: Board;
  groupNamesById: Record<string, string>;
  activeGroups: PlanGroupOption[];
  dueTasks: DueFollowUp[];
}) {
  return (
    <div className="grid gap-5">
      <DueTasks dueTasks={dueTasks} />

      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))] md:gap-4">
        {board.columns.map((col) => {
          const tone = STATE_TONES[col.state];
          return (
            <section
              key={col.state}
              className="flex min-h-[120px] flex-col rounded-md border border-line bg-surface"
            >
              <header className="flex items-center justify-between gap-3 rounded-t-md bg-surfaceAlt px-3.5 py-2.5">
                <span className="flex items-center gap-2 font-sans text-sm font-semibold text-ink">
                  <span
                    aria-hidden="true"
                    className={cn("h-2 w-2 shrink-0 rounded-pill", tone.dot)}
                  />
                  {PROSPECT_STATE_LABEL[col.state]}
                </span>
                <span
                  className={cn(
                    "font-sans text-sm font-semibold tabular-nums",
                    tone.figure
                  )}
                >
                  {col.prospects.length}
                </span>
              </header>
              <div className="grid gap-2.5 p-3">
                {col.prospects.length === 0 ? (
                  <p className="mx-0.5 my-1 font-sans text-sm text-ink3">
                    No prospects here yet.
                  </p>
                ) : (
                  col.prospects.map((p) => (
                    <ProspectCard
                      key={p.id}
                      prospect={p}
                      groupName={
                        p.group_id ? (groupNamesById[p.group_id] ?? null) : null
                      }
                      activeGroups={activeGroups}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <JoinedRollup board={board} />
    </div>
  );
}

// Due tasks (#379): armed follow-ups that have come due (soonest-due first). A
// Follow Up with a date surfaces here on/after its date; connect_to_group_leader
// and undated follow-ups never do. NO messaging provider is wired — the banner
// makes clear nothing is sent and the mechanism is "to be configured".
function DueTasks({ dueTasks }: { dueTasks: DueFollowUp[] }) {
  return (
    <section className="grid gap-2 rounded-md border border-line bg-surface px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 flex items-center gap-2 font-display text-lg font-medium text-ink">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-pill bg-clay"
          />
          Due tasks ({dueTasks.length})
        </h2>
      </div>

      <p className="m-0 rounded-sm border border-dashed border-line px-2 py-1.5 font-sans text-xs text-ink3">
        No messaging provider is wired yet — to be configured. These are armed
        follow-ups shown as reminders; nothing is sent automatically.
      </p>

      {dueTasks.length === 0 ? (
        <p className="mx-0.5 my-0.5 font-sans text-sm text-ink3">
          No follow-ups are due.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {dueTasks.map((t) => (
            <li
              key={t.id}
              className="flex justify-between gap-3 font-sans text-sm text-ink"
            >
              <span>
                {t.full_name}
                {t.detail ? (
                  <span className="text-ink2"> — {t.detail}</span>
                ) : null}
              </span>
              <span className="whitespace-nowrap text-ink2">
                due {t.dueDate}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Collapsed Joined roll-up (acceptance #4): joined Prospects leave the active
// board entirely. They appear only here, name + group, with no count column /
// roster row on the board. A sage status dot marks the Joined tone.
function JoinedRollup({ board }: { board: Board }) {
  const tone = STATE_TONES.joined;
  return (
    <details className="rounded-md border border-line bg-surface px-3.5 py-2.5">
      <summary className="cursor-pointer font-sans text-sm font-semibold text-ink [list-style:revert] hover:underline">
        <span
          aria-hidden="true"
          className={cn(
            "mr-2 inline-block h-2 w-2 shrink-0 rounded-pill align-baseline",
            tone.dot
          )}
        />
        {PROSPECT_STATE_LABEL.joined} ({board.joined.length})
      </summary>
      {board.joined.length === 0 ? (
        <p className="mx-0.5 mb-0.5 mt-2.5 font-sans text-sm text-ink3">
          No one has joined a group yet.
        </p>
      ) : (
        <ul className="m-0 mt-2.5 grid list-none gap-1.5 p-0">
          {board.joined.map((j) => (
            <li
              key={j.id}
              className="flex justify-between gap-3 font-sans text-sm text-ink"
            >
              <span>{j.full_name}</span>
              <span className="text-ink2">{j.groupName ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
