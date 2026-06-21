"use client";

import { useState } from "react";
import { RestoreGroupButton } from "@/components/admin/forms/restore-group-button";
import { SuperAdminInlineDelete } from "@/components/admin/super-admin/inline-delete";
import { Button, LinkButton, buttonClassName } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import type { GroupsRow } from "@/types/database";

// The per-group "More" actions disclosure (#776 Phase 0: refactored onto the
// shared Popover primitive). This is a disclosure of plain buttons/links — not
// an ARIA menu — so the action controls keep their button/link roles (the
// Groups a11y suite drives them as such). Radix replaces the hand-rolled portal
// + getBoundingClientRect viewport math with collision-aware positioning,
// Escape/outside-click dismissal, and z-layering. `onOpenAutoFocus` is
// suppressed so focus stays on the trigger exactly as before.
export function GroupActionsMenu({
  group,
  groupLabel,
  isArchived,
  onEdit,
  isSuperAdmin,
}: {
  group: GroupsRow;
  groupLabel: string;
  isArchived: boolean;
  onEdit: (group: GroupsRow) => void;
  isSuperAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`More actions for ${groupLabel}`}
          className={buttonClassName("ghost", "sm")}
        >
          More
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={`Actions for ${groupLabel}`}
        data-groups-action-menu={group.id}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="z-dropdown grid min-w-[190px] gap-1.5 rounded-md border-0 bg-surface p-2 shadow-softLg"
      >
        {isArchived ? (
          <RestoreGroupButton
            groupId={group.id}
            groupName={group.name}
            ariaLabel={`Restore ${groupLabel}`}
          />
        ) : (
          <>
            <LinkButton
              href={`/admin/groups/${group.id}/calendar`}
              aria-label={`Open ${groupLabel} calendar`}
              variant="ghost"
              size="sm"
              className="w-full justify-start"
            >
              Calendar
            </LinkButton>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Edit ${groupLabel}`}
              className="w-full justify-start"
              onClick={() => {
                setOpen(false);
                onEdit(group);
              }}
            >
              Edit
            </Button>
          </>
        )}
        {isSuperAdmin ? (
          <div className="pt-1">
            <SuperAdminInlineDelete
              entityType="group"
              id={group.id}
              label={group.name}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
