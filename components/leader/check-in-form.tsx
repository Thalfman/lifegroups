"use client";

import Link from "next/link";
import { memo, useCallback, useMemo, useState } from "react";
import { PAvatar } from "@/components/pastoral/atoms";
import { leaderSubmitCheckinAndReturn } from "@/app/(protected)/leader/actions";
import {
  FormStatus,
  useActionForm,
} from "@/components/admin/forms/action-form";
import { fieldInputClassName } from "@/components/admin/forms/field-styles";
import { cn } from "@/lib/utils";
// Match the church-local timezone the server uses for "today" so the
// meeting_date prefill is the leader's wall-clock day even if their
// browser or the rendering server is in a different timezone.
import { CHURCH_TIMEZONE } from "@/lib/shared/church-time";
import { Button } from "@/components/ui/button";

type AttendanceStatus = "present" | "absent" | "excused";
type SessionStatus = "submitted" | "did_not_meet" | "planned_pause";
type Pulse = "healthy" | "watch" | "needs_follow_up";

type Member = { id: string; fullName: string };

type Prefill = {
  status: SessionStatus;
  meetingDate: string | null;
  leaderNote: string;
  pulse: Pulse | "";
  followUpNeeded: boolean;
  attendance: Record<string, AttendanceStatus>;
};

const STATUS_OPTIONS: {
  value: SessionStatus;
  label: string;
  helper: string;
}[] = [
  {
    value: "submitted",
    label: "Yes, we met",
    helper: "Mark each person below as you remember them.",
  },
  {
    value: "did_not_meet",
    label: "No, we didn't meet",
    helper: "We'll record the week without an attendance list.",
  },
  {
    value: "planned_pause",
    label: "Planned pause",
    helper:
      "Use this for a scheduled break that the admin already knows about.",
  },
];

const PULSE_OPTIONS: { value: Pulse; label: string; helper: string }[] = [
  { value: "healthy", label: "Healthy", helper: "Steady, encouraged." },
  {
    value: "watch",
    label: "Watch",
    helper: "Something feels off. Keep an eye on it.",
  },
  {
    value: "needs_follow_up",
    label: "Needs follow-up",
    helper: "Could use a pastor or admin's attention this week.",
  },
];

const ATTENDANCE_OPTIONS: {
  value: AttendanceStatus;
  label: string;
  full: string;
}[] = [
  { value: "present", label: "P", full: "Present" },
  { value: "absent", label: "A", full: "Absent" },
  { value: "excused", label: "E", full: "Excused" },
];

const CHURCH_LOCAL_DATE_FMT =
  typeof Intl !== "undefined"
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: CHURCH_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : null;

function todayIso(): string {
  if (CHURCH_LOCAL_DATE_FMT) return CHURCH_LOCAL_DATE_FMT.format(new Date());
  // Defensive fallback for the unlikely no-Intl environment. Uses the
  // browser's local date rather than UTC so Sunday-evening Central users
  // still default to Sunday, not Monday.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// One roster row, memoized so tapping P/A/E re-renders only the member whose
// status changed — not all N rows × 3 buttons. `onSelect` is the form's stable
// setMember, and `status` is this member's own value, so unchanged rows keep
// identical props and React skips them when the form re-renders for the counts.
const MemberRow = memo(function MemberRow({
  member,
  status,
  isLast,
  onSelect,
}: {
  member: Member;
  status: AttendanceStatus | undefined;
  isLast: boolean;
  onSelect: (memberId: string, value: AttendanceStatus) => void;
}) {
  return (
    <li
      className={cn(
        "lg-m-roster-row flex flex-wrap items-center justify-between gap-3 bg-surface px-4 py-3",
        !isLast && "border-b border-lineSoft"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <PAvatar name={member.fullName} size={36} tone="terra" />
        <span className="font-sans text-md font-medium text-ink">
          {member.fullName}
        </span>
      </div>
      <div
        role="group"
        aria-label={`Attendance for ${member.fullName}`}
        className="flex gap-1.5"
      >
        {ATTENDANCE_OPTIONS.map((opt) => {
          const selected = status === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(member.id, opt.value)}
              aria-label={`Mark ${member.fullName} ${opt.full.toLowerCase()}`}
              aria-pressed={selected}
              className={cn(
                "lg-m-attbtn grid h-11 w-11 cursor-pointer place-items-center rounded-pill border font-sans text-base font-bold transition-colors duration-150",
                selected
                  ? "border-clay bg-clay text-surface"
                  : "border-line bg-transparent text-ink2 hover:bg-surfaceAlt"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </li>
  );
});

export function CheckInForm({
  groupId,
  groupName,
  meetingWeek,
  meetingDay,
  meetingTime,
  dueLabel,
  dueRelative,
  isOverdue,
  members,
  alreadySubmitted,
  prefill,
}: {
  groupId: string;
  groupName: string;
  meetingWeek: string;
  meetingDay: string | null;
  meetingTime: string | null;
  dueLabel: string | null;
  dueRelative: string | null;
  isOverdue: boolean;
  members: Member[];
  alreadySubmitted: boolean;
  prefill: Prefill;
}) {
  const { state, formAction, pending } = useActionForm<{ session_id: string }>(
    leaderSubmitCheckinAndReturn
  );

  const [status, setStatus] = useState<SessionStatus>(prefill.status);
  const [meetingDate, setMeetingDate] = useState<string>(
    prefill.meetingDate ?? todayIso()
  );
  const [leaderNote, setLeaderNote] = useState<string>(prefill.leaderNote);
  const [pulse, setPulse] = useState<Pulse | "">(prefill.pulse);
  const [followUp, setFollowUp] = useState<boolean>(prefill.followUpNeeded);
  const [attendance, setAttendance] = useState<
    Record<string, AttendanceStatus>
  >(prefill.attendance);

  const attendanceJson = useMemo(() => {
    const entries = Object.entries(attendance)
      .filter(([, v]) => v === "present" || v === "absent" || v === "excused")
      .map(([member_id, attendance_status]) => ({
        member_id,
        attendance_status,
      }));
    return JSON.stringify(entries);
  }, [attendance]);

  // Stable identity (no deps — it only uses the functional updater) so the
  // memoized MemberRow below isn't re-rendered just because the form re-rendered
  // to update the running counts.
  const setMember = useCallback((memberId: string, value: AttendanceStatus) => {
    setAttendance((prev) => ({ ...prev, [memberId]: value }));
  }, []);

  const showAttendance = status === "submitted";
  const submitLabel = (() => {
    if (pending) return "Saving…";
    if (status === "did_not_meet") return "Submit: did not meet";
    if (status === "planned_pause") return "Submit: planned pause";
    return alreadySubmitted ? "Update check-in" : "Submit check-in";
  })();

  // One pass over the attendance map (recomputed only when it changes) instead
  // of three separate Object.values().filter() scans on every keystroke/tap.
  const { presentCount, absentCount, excusedCount } = useMemo(() => {
    let present = 0;
    let absent = 0;
    let excused = 0;
    for (const v of Object.values(attendance)) {
      if (v === "present") present += 1;
      else if (v === "absent") absent += 1;
      else if (v === "excused") excused += 1;
    }
    return {
      presentCount: present,
      absentCount: absent,
      excusedCount: excused,
    };
  }, [attendance]);

  const showOverdue = isOverdue && !alreadySubmitted;

  return (
    <form action={formAction} className="grid gap-6">
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="meeting_week" value={meetingWeek} />
      <input type="hidden" name="status" value={status} />
      <input
        type="hidden"
        name="follow_up_needed"
        value={followUp ? "true" : "false"}
      />
      <input type="hidden" name="attendance" value={attendanceJson} />

      <section className="grid gap-1.5 rounded-lg border border-line bg-surface p-card">
        <div className="font-sans text-xs font-medium text-ink3">
          {meetingDay ?? "Meeting"}
          {meetingTime ? ` · ${meetingTime}` : ""}
        </div>
        <div className="font-display text-lg font-medium text-ink">
          Week of{" "}
          {new Date(`${meetingWeek}T00:00:00Z`).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })}
        </div>
        <div className="mt-0.5 font-sans text-sm italic text-ink2">
          {alreadySubmitted
            ? "Already submitted. Submitting again will replace the saved data for this week."
            : "Once you submit, this card will show as complete on your dashboard."}
        </div>
        {dueLabel ? (
          <div
            className={cn(
              "mt-2.5 flex flex-wrap items-center gap-1.5 rounded-sm px-3 py-2 font-sans text-sm leading-snug",
              showOverdue
                ? "bg-claySoft text-clayDeep"
                : "border border-dashed border-line text-ink2"
            )}
          >
            <span
              className={cn(
                "font-sans text-xs font-semibold",
                showOverdue ? "text-clayDeep" : "text-ink3"
              )}
            >
              {showOverdue ? "Overdue" : "Check-in due"}
            </span>
            <span>{dueLabel}</span>
            {dueRelative ? (
              <span className="text-ink3">&middot; {dueRelative}</span>
            ) : null}
          </div>
        ) : null}
      </section>

      <FieldSet eyebrow="Step 1" title="Did the group meet this week?">
        <div className="grid gap-2.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatus(opt.value)}
              aria-pressed={status === opt.value}
              className={cn(
                "grid cursor-pointer gap-1 rounded-md border px-4 py-3.5 text-left transition-colors duration-150",
                status === opt.value
                  ? "border-clay bg-claySoft"
                  : "border-line bg-surface hover:bg-surfaceAlt"
              )}
            >
              <span
                className={cn(
                  "font-sans text-md font-semibold",
                  status === opt.value ? "text-clayDeep" : "text-ink"
                )}
              >
                {opt.label}
              </span>
              <span className="font-sans text-sm text-ink2">{opt.helper}</span>
            </button>
          ))}
        </div>
      </FieldSet>

      <FieldSet
        eyebrow="Step 2"
        title="When did you meet?"
        helper="Optional. Leave today's date if you don't need to change it."
      >
        <input
          type="date"
          name="meeting_date"
          value={meetingDate}
          onChange={(e) => setMeetingDate(e.target.value)}
          className={cn("lg-m-input", fieldInputClassName)}
        />
      </FieldSet>

      {showAttendance ? (
        <FieldSet
          eyebrow="Step 3"
          title="Who was there?"
          helper={`Tap P for present, A for absent, E for excused. ${presentCount}P · ${absentCount}A · ${excusedCount}E so far.`}
        >
          {members.length === 0 ? (
            <div className="rounded-md border border-dashed border-line bg-bg px-5 py-4 text-center font-sans text-sm italic text-ink2">
              {groupName} has no active members on the roster yet. You can still
              submit a shepherd note below, or use the &ldquo;no &mdash; we
              didn&rsquo;t meet&rdquo; option above.
            </div>
          ) : (
            <ul className="m-0 list-none overflow-hidden rounded-lg border border-lineSoft bg-bg p-0">
              {members.map((member, i, arr) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  status={attendance[member.id]}
                  isLast={i === arr.length - 1}
                  onSelect={setMember}
                />
              ))}
            </ul>
          )}
        </FieldSet>
      ) : null}

      <FieldSet
        eyebrow="Optional"
        title="A note for the record"
        helper="Anything you want admins to see this week. Leave blank if nothing comes to mind."
      >
        <textarea
          name="leader_note"
          value={leaderNote}
          onChange={(e) => setLeaderNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Discussion went deep around forgiveness this week…"
          className={cn("lg-m-input", fieldInputClassName, "min-h-24 resize-y")}
        />
      </FieldSet>

      <FieldSet
        eyebrow="Optional"
        title="Health pulse"
        helper="How is the group doing in general? Skip if you'd rather not say."
      >
        <div className="grid gap-2.5">
          <div className="flex flex-wrap gap-2">
            <PulseChip
              label="No update"
              selected={pulse === ""}
              onClick={() => setPulse("")}
            />
            {PULSE_OPTIONS.map((opt) => (
              <PulseChip
                key={opt.value}
                label={opt.label}
                selected={pulse === opt.value}
                onClick={() => setPulse(opt.value)}
              />
            ))}
          </div>
          {pulse !== "" ? (
            <p className="m-0 font-sans text-sm italic text-ink2">
              {PULSE_OPTIONS.find((p) => p.value === pulse)?.helper}
            </p>
          ) : null}
          <input type="hidden" name="pulse" value={pulse} />
          <label className="mt-1 inline-flex cursor-pointer items-center gap-2.5 font-sans text-base text-ink">
            <input
              type="checkbox"
              checked={followUp}
              onChange={(e) => setFollowUp(e.target.checked)}
              className="h-[18px] w-[18px]"
            />
            Group could use a follow-up this week
          </label>
        </div>
      </FieldSet>

      {/* The sticky mobile submit bar keeps its shared shim; its float
          treatment (surface + top hairline) lives in globals.css. */}
      <div className="lg-m-sticky-submit mt-2 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/leader"
          className="font-sans text-sm text-ink2 underline hover:text-ink"
        >
          Cancel and go back
        </Link>
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {submitLabel}
        </Button>
      </div>

      <FormStatus state={state} />
    </form>
  );
}

function FieldSet({
  eyebrow,
  title,
  helper,
  children,
}: {
  eyebrow: string;
  title: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div>
        <div className="mb-1 font-sans text-xs font-medium text-ink3">
          {eyebrow}
        </div>
        <h2 className="m-0 font-display text-xl font-medium text-ink">
          {title}
        </h2>
        {helper ? (
          <p className="m-0 mt-1.5 font-sans text-sm leading-normal text-ink2">
            {helper}
          </p>
        ) : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

function PulseChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "cursor-pointer rounded-pill border px-3.5 py-2 font-sans text-sm font-medium transition-colors duration-150",
        selected
          ? "border-clay bg-clay text-surface"
          : "border-line bg-transparent text-ink hover:bg-surfaceAlt"
      )}
    >
      {label}
    </button>
  );
}
