"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RestoreGroupButton } from "@/components/admin/forms/restore-group-button";
import { SuperAdminInlineDelete } from "@/components/admin/super-admin/inline-delete";
import { Button, LinkButton, buttonClassName } from "@/components/ui/button";
import type { GroupsRow } from "@/types/database";

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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const updateMenuPosition = useCallback(() => {
    if (typeof window === "undefined") return;
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const menuWidth = 190;
    const menuHeight = isSuperAdmin ? 170 : 100;
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      Math.max(8, window.innerWidth - menuWidth - 8)
    );
    const below = rect.bottom + 6;
    const top =
      below + menuHeight <= window.innerHeight - 8
        ? below
        : Math.max(8, rect.top - menuHeight - 6);
    setMenuPosition({ left, top });
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  const menu =
    open && menuPosition && typeof document !== "undefined"
      ? createPortal(
          <div
            data-groups-action-menu={group.id}
            style={{
              left: menuPosition.left,
              position: "fixed",
              top: menuPosition.top,
            }}
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
          </div>,
          document.body
        )
      : null;

  return (
    <div className="inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`More actions for ${groupLabel}`}
        aria-expanded={open}
        aria-haspopup="true"
        className={buttonClassName("ghost", "sm")}
        onClick={() => {
          if (!open) updateMenuPosition();
          setOpen((v) => !v);
        }}
      >
        More
      </button>
      {menu}
    </div>
  );
}
