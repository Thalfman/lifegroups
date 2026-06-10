"use client";

import Link from "next/link";
import { Badge, STATUS_TONES } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/lg/Card";
import { ConfirmActionButton } from "@/components/admin/forms/confirm-action-button";
import {
  adminAssignLeaderToGroup,
  adminAssignMemberToGroup,
  adminEndGroupMembership,
  adminUnassignLeaderFromGroup,
} from "@/app/(protected)/admin/people/actions";
import {
  errorTextClassName,
  fieldLabelClassName,
  fieldSelectClassName,
  successTextClassName,
} from "@/components/admin/forms/field-styles";
import { useActionForm } from "@/components/admin/forms/action-form";
import { cn } from "@/lib/utils";
import type { GroupPeopleTabData } from "@/components/admin/groups/group-detail-data";

// Group-centric roster editing: the group is fixed (this detail page) and the
// admin picks a person — the inverse of PersonGroupAssign on the person detail
// page. Both directions call the same audited assign/remove actions, so the
// two surfaces can never disagree about what assignment means. Removal ends
// only the (person, group) link; the person stays in People.

const LABEL_TEXT =
  "font-sans text-xs font-semibold uppercase tracking-wide text-ink3";
const BODY_TEXT = "font-sans text-base text-ink2";
const READ_ERROR_TEXT =
  "m-0 rounded-md bg-claySoft px-3.5 py-2.5 font-sans text-sm text-clayDeep";
const LIST_RESET = "m-0 list-none p-0";

export function GroupRosterManager({
  groupId,
  groupName,
  data,
}: {
  groupId: string;
  groupName: string;
  data: GroupPeopleTabData;
}) {
  return (
    <div className="grid gap-3.5">
      {data.archived ? (
        <p
          role="note"
          className={cn(
            "m-0 rounded-md border border-dashed border-line bg-surface px-3.5 py-3",
            BODY_TEXT,
            "text-sm"
          )}
        >
          This group is archived, so its roster is read-only. Restore the group
          to edit who&rsquo;s in it.
        </p>
      ) : null}

      <Card>
        <div className="grid gap-2.5">
          <div className={LABEL_TEXT}>Leaders</div>
          {data.leaders === null ? (
            <p role="alert" className={READ_ERROR_TEXT}>
              Leaders couldn&apos;t be loaded right now.
            </p>
          ) : (
            <>
              {data.leaders.length === 0 ? (
                <p className={cn("m-0", BODY_TEXT)}>
                  No leader assigned yet
                  {data.archived ? "." : " — assign one below."}
                </p>
              ) : (
                <ul className={LIST_RESET}>
                  {data.leaders.map((l) => (
                    <li
                      key={l.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-t border-lineSoft py-2 first:border-t-0"
                    >
                      <span className={BODY_TEXT}>
                        {l.name ?? "(unknown)"}{" "}
                        <Badge tone="neutral" dot>
                          {l.isCoLeader ? "Co-Leader" : "Leader"}
                        </Badge>
                      </span>
                      {!data.archived ? (
                        <ConfirmActionButton
                          action={adminUnassignLeaderFromGroup}
                          confirmMessage={removeConfirmMessage(
                            l.name ?? "this leader",
                            groupName
                          )}
                          hiddenFields={[
                            { name: "group_id", value: groupId },
                            { name: "profile_id", value: l.profileId },
                          ]}
                          idleLabel="Remove"
                          pendingLabel="Removing…"
                          tone="ghost"
                          ariaLabel={`Remove ${l.name ?? "this leader"} from ${groupName}`}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {!data.archived ? (
                <RosterAssignRow
                  kind="leader"
                  groupId={groupId}
                  groupName={groupName}
                  options={data.assignableLeaders}
                />
              ) : null}
            </>
          )}
        </div>
      </Card>

      <Card>
        <div className="grid gap-2.5">
          <div className={LABEL_TEXT}>
            Active members
            {data.members === null ? "" : ` (${data.members.length})`}
          </div>
          {data.members === null ? (
            <p role="alert" className={READ_ERROR_TEXT}>
              Members couldn&apos;t be loaded right now.
            </p>
          ) : (
            <>
              {data.members.length === 0 ? (
                <p className={cn("m-0", BODY_TEXT)}>
                  No active members on the roster
                  {data.archived ? "." : " — assign one below."}
                </p>
              ) : (
                <ul className={LIST_RESET}>
                  {data.members.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-t border-lineSoft py-2 first:border-t-0"
                    >
                      <span className={BODY_TEXT}>{m.fullName}</span>
                      {!data.archived ? (
                        <ConfirmActionButton
                          action={adminEndGroupMembership}
                          confirmMessage={removeConfirmMessage(
                            m.fullName,
                            groupName
                          )}
                          hiddenFields={[
                            { name: "group_id", value: groupId },
                            { name: "member_id", value: m.id },
                          ]}
                          idleLabel="Remove"
                          pendingLabel="Removing…"
                          tone="ghost"
                          ariaLabel={`Remove ${m.fullName} from ${groupName}`}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {!data.archived ? (
                <RosterAssignRow
                  kind="member"
                  groupId={groupId}
                  groupName={groupName}
                  options={data.assignableMembers}
                />
              ) : null}
            </>
          )}
        </div>
      </Card>

      {/* This group's view into the Interest Funnel. GROUP-LEVEL ONLY:
          prospects carry no member/profile FK, so no per-person "came from
          prospect X" claim is made anywhere — that would be a name-match
          guess, not a fact. */}
      <Card>
        <div className="grid gap-2.5">
          <div className={LABEL_TEXT}>Interest Funnel</div>
          {data.prospectSignals === null ? (
            <p role="alert" className={READ_ERROR_TEXT}>
              The Interest Funnel couldn&apos;t be read right now — this is not
              a confirmation that no Prospects are matched to this group.
            </p>
          ) : (
            <>
              {data.prospectSignals.matched.length === 0 ? (
                <p className={cn("m-0", BODY_TEXT)}>
                  No Prospects are currently matched to this group.
                </p>
              ) : (
                <ul className={LIST_RESET}>
                  {data.prospectSignals.matched.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center gap-2 border-t border-lineSoft py-2 first:border-t-0"
                    >
                      <span className={BODY_TEXT}>{p.full_name}</span>
                      <Badge tone={STATUS_TONES.info} dot>
                        Matched
                      </Badge>
                      <span className="font-sans text-sm text-ink3">
                        being matched to this group — follow-up under way
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {data.prospectSignals.joinedCount > 0 ? (
                <p className={cn("m-0", BODY_TEXT, "text-sm")}>
                  {data.prospectSignals.joinedCount}{" "}
                  {data.prospectSignals.joinedCount === 1 ? "person" : "people"}{" "}
                  joined this group through the Interest Funnel.
                </p>
              ) : null}
            </>
          )}
          <Link
            href="/admin/plan"
            className="font-sans text-sm text-clay no-underline"
          >
            Open the Interest Funnel →
          </Link>
        </div>
      </Card>

      {/* People stays the cross-roster home (create people, see everyone). */}
      <Link
        href="/admin/people"
        className="font-sans text-sm text-clay no-underline"
      >
        Manage everyone in People →
      </Link>
    </div>
  );
}

// One confirm voice for both kinds: removal ends only this group link.
function removeConfirmMessage(name: string, groupName: string): string {
  return `Remove ${name} from ${groupName}? They stay in People — this only ends the group assignment.`;
}

// The inline assign control under each roster list: pick a person (+ role for
// leaders) and assign them to THIS group. Options arrive precomputed (active
// people not already on the roster) and fail closed to null, which renders a
// degraded note instead of wrong choices.
function RosterAssignRow({
  kind,
  groupId,
  groupName,
  options,
}: {
  kind: "leader" | "member";
  groupId: string;
  groupName: string;
  options: Array<{ id: string; name: string }> | null;
}) {
  const action =
    kind === "leader" ? adminAssignLeaderToGroup : adminAssignMemberToGroup;
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    action,
    { resetOnSuccess: true }
  );

  if (options === null) {
    return (
      <p role="alert" className={READ_ERROR_TEXT}>
        The list of people available to assign couldn&apos;t be loaded right
        now, so assigning from here is paused. Retry in a moment.
      </p>
    );
  }

  const noOptions = options.length === 0;
  const personField = kind === "leader" ? "profile_id" : "member_id";
  const personLabel = kind === "leader" ? "Leader" : "Member";
  const selectId = `roster-assign-${kind}-${groupId}`;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-2.5 border-t border-lineSoft pt-3"
    >
      <input type="hidden" name="group_id" value={groupId} />
      <div
        className={cn(
          "grid grid-cols-1 items-end gap-2.5",
          kind === "leader"
            ? "md:grid-cols-[1fr_140px_auto]"
            : "md:grid-cols-[1fr_auto]"
        )}
      >
        <div>
          <label htmlFor={selectId} className={fieldLabelClassName}>
            {personLabel}
          </label>
          <select
            id={selectId}
            name={personField}
            required
            disabled={noOptions}
            className={fieldSelectClassName}
            defaultValue=""
          >
            <option value="" disabled>
              {noOptions
                ? `No ${kind === "leader" ? "leaders" : "members"} left to assign`
                : `Pick a ${kind}…`}
            </option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        {kind === "leader" ? (
          <div>
            <label htmlFor={`${selectId}-role`} className={fieldLabelClassName}>
              Role
            </label>
            <select
              id={`${selectId}-role`}
              name="role"
              required
              disabled={noOptions}
              className={fieldSelectClassName}
              defaultValue="leader"
            >
              <option value="leader">Leader</option>
              <option value="co_leader">Co-leader</option>
            </select>
          </div>
        ) : null}
        <div>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={pending || noOptions}
            aria-label={`Assign a ${kind} to ${groupName}`}
          >
            {pending ? "Assigning…" : "Assign"}
          </Button>
        </div>
      </div>
      {noOptions ? (
        <p className="m-0 font-sans text-xs text-ink3">
          {kind === "leader"
            ? "Every active leader and co-leader is already on this roster. Add a new leader from People."
            : "Every active member is already on this roster. Add a new member from People."}
        </p>
      ) : null}
      {state && !state.ok ? (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {state.errors.map((err, i) => (
            <li key={i}>
              <p className={errorTextClassName}>{err}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {state?.ok ? (
        <p className={successTextClassName}>Assigned to {groupName}.</p>
      ) : null}
    </form>
  );
}
