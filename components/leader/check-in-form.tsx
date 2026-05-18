"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { PAvatar } from "@/components/pastoral/atoms";
import { PButton } from "@/components/pastoral/button";
import { leaderSubmitCheckinAndReturn } from "@/app/(protected)/leader/actions";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type { ActionResult } from "@/lib/leader/action-result";
// Match the church-local timezone the server uses for "today" so the
// meeting_date prefill is the leader's wall-clock day even if their
// browser or the rendering server is in a different timezone.
import { CHURCH_TIMEZONE } from "@/lib/leader/validation";

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

type State = ActionResult<{ session_id: string }> | undefined;

const STATUS_OPTIONS: { value: SessionStatus; label: string; helper: string }[] = [
  {
    value: "submitted",
    label: "Yes — we met",
    helper: "Mark each person below as you remember them.",
  },
  {
    value: "did_not_meet",
    label: "No — we didn't meet",
    helper: "We'll record the week without an attendance list.",
  },
  {
    value: "planned_pause",
    label: "Planned pause",
    helper: "Use this for a scheduled break that the admin already knows about.",
  },
];

const PULSE_OPTIONS: { value: Pulse; label: string; helper: string }[] = [
  { value: "healthy", label: "Healthy", helper: "Steady, encouraged." },
  { value: "watch", label: "Watch", helper: "Something feels off — keep an eye on it." },
  {
    value: "needs_follow_up",
    label: "Needs follow-up",
    helper: "Could use a pastor or admin's attention this week.",
  },
];

const ATTENDANCE_OPTIONS: { value: AttendanceStatus; label: string; full: string }[] = [
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

export function CheckInForm({
  groupId,
  groupName,
  meetingWeek,
  meetingDay,
  meetingTime,
  members,
  alreadySubmitted,
  prefill,
}: {
  groupId: string;
  groupName: string;
  meetingWeek: string;
  meetingDay: string | null;
  meetingTime: string | null;
  members: Member[];
  alreadySubmitted: boolean;
  prefill: Prefill;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    leaderSubmitCheckinAndReturn,
    undefined,
  );

  const [status, setStatus] = useState<SessionStatus>(prefill.status);
  const [meetingDate, setMeetingDate] = useState<string>(prefill.meetingDate ?? todayIso());
  const [leaderNote, setLeaderNote] = useState<string>(prefill.leaderNote);
  const [pulse, setPulse] = useState<Pulse | "">(prefill.pulse);
  const [followUp, setFollowUp] = useState<boolean>(prefill.followUpNeeded);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(
    prefill.attendance,
  );

  const attendanceJson = useMemo(() => {
    const entries = Object.entries(attendance)
      .filter(([, v]) => v === "present" || v === "absent" || v === "excused")
      .map(([member_id, attendance_status]) => ({ member_id, attendance_status }));
    return JSON.stringify(entries);
  }, [attendance]);

  function setMember(memberId: string, value: AttendanceStatus) {
    setAttendance((prev) => ({ ...prev, [memberId]: value }));
  }

  const showAttendance = status === "submitted";
  const submitLabel = (() => {
    if (pending) return "Saving…";
    if (status === "did_not_meet") return "Submit — did not meet";
    if (status === "planned_pause") return "Submit — planned pause";
    return alreadySubmitted ? "Update check-in" : "Submit check-in";
  })();

  const presentCount = Object.values(attendance).filter((v) => v === "present").length;
  const absentCount = Object.values(attendance).filter((v) => v === "absent").length;
  const excusedCount = Object.values(attendance).filter((v) => v === "excused").length;

  return (
    <form
      action={formAction}
      style={{ display: "grid", gap: 22 }}
    >
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="meeting_week" value={meetingWeek} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="follow_up_needed" value={followUp ? "true" : "false"} />
      <input type="hidden" name="attendance" value={attendanceJson} />

      <section
        style={{
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderRadius: 14,
          padding: "20px 22px",
          display: "grid",
          gap: 6,
        }}
      >
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 1.8,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 600,
          }}
        >
          {meetingDay ?? "Meeting"}
          {meetingTime ? ` · ${meetingTime}` : ""}
        </div>
        <div
          style={{
            fontFamily: fontDisplay,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: -0.2,
            color: P.ink,
          }}
        >
          Week of {new Date(`${meetingWeek}T00:00:00Z`).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })}
        </div>
        <div
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            fontStyle: "italic",
            marginTop: 2,
          }}
        >
          {alreadySubmitted
            ? "Already submitted — submitting again will replace the saved data for this week."
            : "Once you submit, this card will show as complete on your dashboard."}
        </div>
      </section>

      <FieldSet
        eyebrow="Step 1"
        title="Did the group meet this week?"
      >
        <div style={{ display: "grid", gap: 10 }}>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatus(opt.value)}
              aria-pressed={status === opt.value}
              style={{
                textAlign: "left",
                background: status === opt.value ? P.terraSoft : P.surface,
                border: `1px solid ${status === opt.value ? P.terra : P.line}`,
                borderRadius: 12,
                padding: "14px 16px",
                cursor: "pointer",
                fontFamily: fontBody,
                display: "grid",
                gap: 4,
              }}
            >
              <span
                style={{
                  fontFamily: fontDisplay,
                  fontWeight: 600,
                  fontSize: 15,
                  color: status === opt.value ? "#7d3621" : P.ink,
                }}
              >
                {opt.label}
              </span>
              <span style={{ fontSize: 13, color: P.ink2 }}>{opt.helper}</span>
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
          style={inputStyle}
        />
      </FieldSet>

      {showAttendance ? (
        <FieldSet
          eyebrow="Step 3"
          title="Who was there?"
          helper={`Tap P for present, A for absent, E for excused. ${presentCount}P · ${absentCount}A · ${excusedCount}E so far.`}
        >
          {members.length === 0 ? (
            <div
              style={{
                background: P.bg,
                border: `1px dashed ${P.line}`,
                borderRadius: 12,
                padding: "18px 20px",
                fontFamily: fontBody,
                fontSize: 13.5,
                color: P.ink2,
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              {groupName} has no active members on the roster yet. You can still
              submit a leader note below, or use the &ldquo;no &mdash; we
              didn&rsquo;t meet&rdquo; option above.
            </div>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                background: P.bg,
                border: `1px solid ${P.line2}`,
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              {members.map((member, i, arr) => {
                const current = attendance[member.id];
                return (
                  <li
                    key={member.id}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 12,
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 18px",
                      borderBottom:
                        i < arr.length - 1 ? `1px solid ${P.line2}` : "none",
                      background: P.surface,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        minWidth: 0,
                      }}
                    >
                      <PAvatar name={member.fullName} size={36} tone="terra" />
                      <span
                        style={{
                          fontFamily: fontBody,
                          fontSize: 15,
                          fontWeight: 500,
                          color: P.ink,
                        }}
                      >
                        {member.fullName}
                      </span>
                    </div>
                    <div role="group" aria-label={`Attendance for ${member.fullName}`}
                      style={{ display: "flex", gap: 6 }}
                    >
                      {ATTENDANCE_OPTIONS.map((opt) => {
                        const selected = current === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setMember(member.id, opt.value)}
                            aria-label={`Mark ${member.fullName} ${opt.full.toLowerCase()}`}
                            aria-pressed={selected}
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 999,
                              display: "grid",
                              placeItems: "center",
                              fontSize: 14,
                              fontFamily: fontSans,
                              fontWeight: 700,
                              background: selected ? P.terra : "transparent",
                              color: selected ? P.surface : P.ink2,
                              border: `1px solid ${selected ? P.terra : P.line}`,
                              cursor: "pointer",
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </FieldSet>
      ) : null}

      <FieldSet
        eyebrow="Optional"
        title="A quick note for the record"
        helper="Anything you want admins to see this week. Leave blank if nothing comes to mind."
      >
        <textarea
          name="leader_note"
          value={leaderNote}
          onChange={(e) => setLeaderNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Discussion went deep around forgiveness this week…"
          style={{ ...inputStyle, resize: "vertical", minHeight: 90 }}
        />
      </FieldSet>

      <FieldSet
        eyebrow="Optional"
        title="Health pulse"
        helper="How is the group doing in general? Skip if you'd rather not say."
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink2,
                margin: 0,
                fontStyle: "italic",
              }}
            >
              {PULSE_OPTIONS.find((p) => p.value === pulse)?.helper}
            </p>
          ) : null}
          <input type="hidden" name="pulse" value={pulse} />
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              fontFamily: fontBody,
              fontSize: 14,
              color: P.ink,
              marginTop: 4,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={followUp}
              onChange={(e) => setFollowUp(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            Group could use a follow-up this week
          </label>
        </div>
      </FieldSet>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 8,
        }}
      >
        <Link
          href="/leader"
          style={{
            fontFamily: fontSans,
            fontSize: 13,
            color: P.ink2,
            textDecoration: "underline",
          }}
        >
          Cancel and go back
        </Link>
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {submitLabel}
        </PButton>
      </div>

      {state && !state.ok ? (
        <ul
          role="alert"
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 6,
          }}
        >
          {state.errors.map((err, i) => (
            <li
              key={i}
              style={{
                fontFamily: fontBody,
                fontSize: 13.5,
                color: "#923220",
                background: P.terraSoft,
                padding: "10px 14px",
                borderRadius: 8,
              }}
            >
              {err}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${P.line}`,
  background: P.surface,
  fontFamily: fontBody,
  fontSize: 14,
  color: P.ink,
  outline: "none",
  lineHeight: 1.4,
} as const;

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
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 1.8,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          {eyebrow}
        </div>
        <h2
          style={{
            fontFamily: fontDisplay,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: -0.3,
            color: P.ink,
            margin: 0,
          }}
        >
          {title}
        </h2>
        {helper ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink2,
              margin: "6px 0 0",
              lineHeight: 1.5,
            }}
          >
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
      style={{
        background: selected ? P.terra : "transparent",
        color: selected ? P.surface : P.ink,
        border: `1px solid ${selected ? P.terra : P.line}`,
        borderRadius: 999,
        padding: "8px 14px",
        fontFamily: fontSans,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
