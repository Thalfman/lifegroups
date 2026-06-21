import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge, STATUS_TONES } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { DisclosureChevron } from "@/components/admin/care/disclosure-chevron";
import { MountOnOpenDetails } from "@/components/admin/care/mount-on-open-details";
import { formatIsoDateOr } from "@/lib/shared/date";
import { pluralize } from "@/lib/shared/pluralize";
import { ShepherdCareStatusBadge } from "@/components/admin/shepherd-care/status-badge";
import { NoteTransparencyToggle } from "@/components/admin/shepherd-care/note-transparency-toggle";
import { CareNoteWriteForm } from "@/components/admin/shepherd-care/care-note-write-form";
import { LeaderHealthGradeEditor } from "@/components/admin/shepherd-care/leader-health-grade";
import { GroupRubricGradeEntry } from "@/components/admin/care/group-rubric-grade-entry";
import {
  isNoteTransparencyGranted,
  resolveGroupGradeSeed,
  resolveLeaderGradeSeed,
  type CareAccordionLeader,
  type CareGradeEntryBundle,
} from "@/lib/admin/care-accordion";

// The per-Leader detail inside a Care accordion pane (#373, ADR 0016). Opened
// (it lives behind its own <details>), it shows an at-a-glance contact line
// (the spreadsheet's Last contact / Next step), the Leader's pastoral Leader
// Care Status, and the four slots that were placeholders until #377/#378/#381:
// the Group-Health Grade(s), the Leader-Health Grade, and the Care Notes /
// Prayer Requests presence. The slots read from the accordion model's enrichment
// (no per-leader reads here); the Leader name still links into the full
// per-leader detail surface where the actual care work happens. The Care Notes
// & Prayer slot also hosts the inline transparency toggle (#467) — the same
// audited control the detail page uses — so the Ministry Admin can flip a
// Leader's grant without leaving the accordion. The slot stays counts-only:
// note and Prayer Request bodies never render here.

const SLOT_LABEL = "m-0 font-sans text-xs font-medium text-ink3";
const VALUE_TEXT = "font-sans text-sm text-ink";
const MUTED_TEXT = "font-sans text-sm italic text-ink3";

// A small A–F letter pill. D / F read as a concern (clay tint); A–C are neutral.
function LetterBadge({ letter }: { letter: string }) {
  const concern = letter === "D" || letter === "F";
  return (
    <span
      className={cn(
        "inline-flex min-w-[18px] justify-center rounded border px-1.5 py-px font-sans text-xs font-bold",
        concern
          ? "border-claySoft bg-claySoft text-clayDeep"
          : "border-line bg-bg text-ink"
      )}
    >
      {letter}
    </span>
  );
}

function Slot({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className={SLOT_LABEL}>{label}</p>
      <div>{children}</div>
    </div>
  );
}

// "N care note(s) · M prayer request(s)", or a none-yet line. Rendered only
// when the Leader's transparency grant is on; never a note body — only counts
// behind the RLS grant. Sealed Leaders skip this line entirely: the inline
// toggle below carries the sealed state instead (#467).
function CareNoteCounts({ notes }: { notes: CareAccordionLeader["notes"] }) {
  if (notes.careNoteCount === 0 && notes.prayerCount === 0) {
    return <span className={MUTED_TEXT}>None yet.</span>;
  }
  const parts = [
    pluralize(notes.careNoteCount, "care note"),
    pluralize(notes.prayerCount, "prayer request"),
  ];
  return <span className={VALUE_TEXT}>{parts.join(" · ")}</span>;
}

// ADR 0023 — the collapsed inline work area: the SAME grade editors and note
// write forms the per-leader detail page hosts, so grading and note-writing
// are reachable from the Care list without a navigation. Mirrors the detail
// page's guards: group editors only inside a Ministry Year, the leader editor
// renders its own off-season state, and a failed grade read shows the
// "reload before editing" warning instead of an editor.
const GRADE_READ_ERROR =
  "m-0 rounded-md bg-claySoft px-3.5 py-2.5 font-sans text-sm text-clayDeep";

function GradesAndNotes({
  leader,
  gradeEntry,
}: {
  leader: CareAccordionLeader;
  gradeEntry: CareGradeEntryBundle;
}) {
  const { ministryYear, periodMonthIso } = gradeEntry;
  // Off-season (null ministryYear) resolves to an empty seed inside the
  // resolver; the editor renders its own closed state.
  const leaderSeed = resolveLeaderGradeSeed(
    gradeEntry.leaderGradeByProfileId.get(leader.profileId),
    gradeEntry.leaderCriteria,
    ministryYear,
    periodMonthIso
  );

  // #777 WS3: the form-heavy editors (leader + group grade editors, two note
  // write forms) mount only when this section is first opened, so opening a
  // leader panel no longer hydrates every editor up front.
  return (
    <MountOnOpenDetails
      detailsClassName="rounded-sm border border-lineSoft bg-bg/40"
      summaryClassName="lg-sac-summary flex items-center gap-2 rounded-sm px-3 py-2 font-sans text-sm font-semibold text-ink2 transition-colors duration-150 hover:bg-surfaceAlt"
      bodyClassName="grid gap-4 px-3 pb-3.5 pt-1.5"
      summary={
        <>
          <DisclosureChevron />
          <span>Grades &amp; notes</span>
        </>
      }
    >
      <section className="grid gap-2">
        <h4 className={cn(SLOT_LABEL, "m-0")}>Shepherd-Health Grade</h4>
        {gradeEntry.leaderGradesAvailable ? (
          <LeaderHealthGradeEditor
            profileId={leader.profileId}
            leaderName={leader.fullName}
            ministryYear={ministryYear}
            criteria={gradeEntry.leaderCriteria}
            initialScores={leaderSeed.scores}
            initialOverrideLetter={leaderSeed.overrideLetter}
            initialOverrideScope={leaderSeed.overrideScope}
          />
        ) : (
          <p role="alert" className={GRADE_READ_ERROR}>
            This leader&rsquo;s grade couldn&rsquo;t be loaded. Reload before
            editing — saving now could overwrite the saved grade.
          </p>
        )}
      </section>

      {ministryYear !== null && leader.ledGroups.length > 0 ? (
        <section className="grid gap-2">
          <h4 className={cn(SLOT_LABEL, "m-0")}>Group-Health Grade</h4>
          {leader.ledGroups.map((g) => {
            if (!gradeEntry.groupGradesAvailable) {
              return (
                <p key={g.id} role="alert" className={GRADE_READ_ERROR}>
                  {g.name}&rsquo;s grade couldn&rsquo;t be loaded. Reload before
                  editing — saving now could overwrite the saved grade.
                </p>
              );
            }
            const seed = resolveGroupGradeSeed(
              gradeEntry.groupGradeByGroupId.get(g.id),
              gradeEntry.groupCriteria,
              periodMonthIso
            );
            return (
              <GroupRubricGradeEntry
                key={g.id}
                groupId={g.id}
                groupName={g.name}
                ministryYear={ministryYear}
                criteria={gradeEntry.groupCriteria}
                initialScores={seed.scores}
                initialOverrideLetter={seed.overrideLetter}
                initialOverrideScope={seed.overrideScope}
              />
            );
          })}
        </section>
      ) : null}

      <section className="grid gap-3">
        <h4 className={cn(SLOT_LABEL, "m-0")}>Write a note</h4>
        <CareNoteWriteForm
          subjectProfileId={leader.profileId}
          kind="care_note"
          subjectName={leader.fullName}
        />
        <CareNoteWriteForm
          subjectProfileId={leader.profileId}
          kind="prayer_request"
          subjectName={leader.fullName}
        />
      </section>
    </MountOnOpenDetails>
  );
}

export function CareLeaderPanel({
  leader,
  gradeEntry,
}: {
  leader: CareAccordionLeader;
  // ADR 0023 — when provided, the panel hosts the inline grade editors + note
  // write forms. Omitted in contexts without the enrichment (older tests).
  gradeEntry?: CareGradeEntryBundle;
}) {
  const groupLabel =
    leader.groupNames.length > 0 ? leader.groupNames.join(", ") : "No group";
  const granted = isNoteTransparencyGranted(leader.notes);

  // #777 WS3: the leader summary (name, group, needs-attention badge, care
  // status) stays server-rendered so an opened pane still scans; the body —
  // slots, the transparency toggle, and the Grades & notes editors — mounts on
  // first open, then stays mounted.
  return (
    <MountOnOpenDetails
      detailsClassName="rounded-sm border border-lineSoft bg-surface"
      summaryClassName="lg-sac-summary flex items-center gap-3 rounded-sm px-3.5 py-2.5 transition-colors duration-150 hover:bg-surfaceAlt"
      bodyClassName="grid gap-3.5 px-3.5 pb-4 pt-1"
      summary={
        <>
          <DisclosureChevron />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="font-sans text-base font-semibold text-ink [overflow-wrap:anywhere]">
              {leader.fullName}
            </span>
            <span className="font-sans text-sm text-ink3">{groupLabel}</span>
            {/* The roster's needs-attention flag, mirrored onto the Leader so a
                roll-up pane that reads "2 need attention" points at exactly which
                two when opened. Tone via badge, never a stripe (design system). */}
            {leader.needsAttention ? (
              <Badge
                tone={STATUS_TONES.followUp}
                dot
                className="mt-0.5 justify-self-start"
              >
                Needs attention
              </Badge>
            ) : null}
          </span>
          {leader.careStatus ? (
            <ShepherdCareStatusBadge status={leader.careStatus} />
          ) : (
            <span className={cn(MUTED_TEXT, "whitespace-nowrap")}>
              No care status yet
            </span>
          )}
        </>
      }
    >
      {/* At-a-glance, mirroring the spreadsheet row (Last contact / Next step).
            Both come straight from the care directory row — no extra read. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
        <Slot label="Last contact">
          <span className={VALUE_TEXT}>
            {formatIsoDateOr(leader.lastContactAt, "Never")}
          </span>
        </Slot>
        <Slot label="Next step">
          <span className={VALUE_TEXT}>
            {formatIsoDateOr(leader.nextStepDue)}
          </span>
        </Slot>
      </div>

      <Slot label="Shepherd Care Status">
        {leader.careStatus ? (
          <ShepherdCareStatusBadge status={leader.careStatus} />
        ) : (
          <span className={MUTED_TEXT}>No care status set yet.</span>
        )}
      </Slot>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        <Slot label="Group-Health Grade">
          {leader.ledGroups.length === 0 ? (
            <span className={MUTED_TEXT}>No active group.</span>
          ) : (
            <div className="grid gap-1">
              {leader.ledGroups.map((g) => (
                <span
                  key={g.id}
                  className={cn("flex items-center gap-1.5", VALUE_TEXT)}
                >
                  {g.healthGrade ? (
                    <LetterBadge letter={g.healthGrade} />
                  ) : (
                    <span className={MUTED_TEXT}>Not graded</span>
                  )}
                  <span className="text-ink2 [overflow-wrap:anywhere]">
                    {g.name}
                  </span>
                </span>
              ))}
            </div>
          )}
        </Slot>

        <Slot label="Shepherd-Health Grade">
          {leader.leaderHealthGrade ? (
            <LetterBadge letter={leader.leaderHealthGrade} />
          ) : (
            <span className={MUTED_TEXT}>Not graded</span>
          )}
        </Slot>

        <Slot label="Care Notes & Prayer">
          <div className="grid gap-2">
            {granted ? <CareNoteCounts notes={leader.notes} /> : null}
            {/* #467 — the same Ministry-Admin-controlled toggle the
                  per-leader detail page renders (one audited write path:
                  setNoteTransparencyGrant → set_note_transparency_grant
                  RPC). Its revalidate list covers /admin/care, so a flip
                  re-renders this panel in the new state. */}
            <NoteTransparencyToggle
              subjectProfileId={leader.profileId}
              granted={granted}
              subjectName={leader.fullName}
            />
          </div>
        </Slot>
      </div>

      {/* ADR 0023 — inline grading + note-writing, collapsed so the scan
            surface stays scannable. Same editors/actions as the detail page
            (one audited write path each); their revalidate lists cover
            /admin/care, so a save re-renders the accordion. */}
      {gradeEntry ? (
        <GradesAndNotes leader={leader} gradeEntry={gradeEntry} />
      ) : null}

      <Link
        href={`/admin/shepherd-care/${leader.profileId}`}
        className={buttonClassName("ghost", "sm", "justify-self-start")}
      >
        Open leader care →
      </Link>
    </MountOnOpenDetails>
  );
}
