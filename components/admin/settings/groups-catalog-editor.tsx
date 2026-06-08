"use client";

import { useState, useTransition, type FormEvent } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  adminArchiveGroupCategory,
  adminCreateGroupCategory,
  adminRenameGroupCategory,
  adminSetCategoryTypeCell,
  adminSetCategoryTypeTargetCount,
} from "@/app/(protected)/admin/settings/actions";
import { P, fontBody } from "@/lib/pastoral";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { AUDIENCE_CATEGORIES } from "@/lib/admin/audience";
import {
  resolveCategoryForLabel,
  sortGroupTypeRows,
} from "@/lib/admin/group-type-list";
import { GroupEditForm } from "@/components/admin/forms/group-edit-form";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { useEditingDrawer } from "@/components/lg/admin/use-editing-drawer";
import type { CategoriesByAudience } from "@/components/admin/forms/group-category-options";
import type { CellCoverage } from "@/lib/admin/cell-coverage";
import type { GroupsRow } from "@/types/database";
import type { GroupAudienceCategory } from "@/types/enums";

// Settings › Groups: the group-type list + "+" create flow (#412 / ADR 0021).
// Reworks the old category×type matrix into a flat LIST of group types (cells),
// each row an (Audience × category) with its target, coverage ("have X of Y"),
// rename and remove — plus a "+" flow that creates one in a single step (pick an
// Audience, type a free-text category, save). The catalog stays shared under the
// hood: a typed label that already exists resolves to the one category (rename
// then syncs across Audiences), so the same label under a second Audience reuses
// it with no migration. Every write is its own audited RPC — there is no
// client-side batching, so each create / apply / target / rename / remove
// round-trips through the server's authoritative gate.

const TYPE_LABEL: Record<GroupAudienceCategory, string> = {
  men: "Men's",
  women: "Women's",
  mixed: "Mixed",
};

export function GroupsCatalogEditor({
  cells,
  categories,
  categoryIdsWithGroups,
  groups,
  categoriesByAudience,
  groupReferencesKnown,
}: {
  // One row per ACTIVE cell, carrying its label + coverage ("have X of Y"). The
  // list is the live group types; an off / never-applied cell has no row.
  cells: CellCoverage[];
  // The live catalog (id + label), so the create flow can dedupe a typed label
  // against an existing shared category rather than creating a second one.
  categories: { id: string; label: string }[];
  // Category ids still referenced by at least one group (any audience /
  // lifecycle). Such a category is NOT offered for deletion even with no active
  // cell — archiving it would orphan those groups' label (reads resolve an
  // archived category to "Uncategorized").
  categoryIdsWithGroups: ReadonlySet<string>;
  // Every group (any lifecycle). The non-archived ones are nested under their
  // matching group-type row so each can be edited in place; the rest fall into
  // an "Other groups" catch-all so none is unreachable.
  groups: GroupsRow[];
  // The category-picker options per top type for the inline edit drawer's
  // GroupEditForm (same shape the Groups page passes it).
  categoriesByAudience: CategoriesByAudience;
  // Whether the groups read that backs categoryIdsWithGroups succeeded. When the
  // groups read failed, the set is empty for the wrong reason (not "no groups"),
  // so we can't safely tell which categories are unreferenced — suppress the
  // Delete-category cleanup entirely rather than risk archiving an in-use label.
  groupReferencesKnown: boolean;
}) {
  // Group shared-category rows together (label then Audience) so the "rename
  // syncs across both" behaviour reads clearly; the coverage shortfall order
  // upstream does not matter here.
  const rows = sortGroupTypeRows(cells);

  // The drawer that edits one individual group — the same EditingSurface +
  // GroupEditForm the Groups page uses (#266). One instance for the whole list;
  // `target` is the group id being edited. On save it revalidates Settings and
  // refreshes, so the re-read coverage + group lists reflect the edit.
  const drawer = useEditingDrawer<string>({
    closeOnSave: true,
    refreshOnSave: true,
  });
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const editingGroup = drawer.target
    ? (groupsById.get(drawer.target) ?? null)
    : null;

  // Index the active (non-archived) groups by their (Audience × category) type
  // key, so each type row can list its own groups. An archived group (closed_at
  // set) is off the roster and not shown.
  const activeGroups = groups.filter((g) => g.closed_at == null);
  const groupsByType = new Map<string, GroupsRow[]>();
  for (const g of activeGroups) {
    const key = typeKey(g.audience_category, g.category_id);
    const bucket = groupsByType.get(key);
    if (bucket) bucket.push(g);
    else groupsByType.set(key, [g]);
  }

  // Active groups that match no active group-type row (uncategorized, or a type
  // that's since been removed). They'd otherwise be unreachable here, so a
  // catch-all keeps every group editable from this tab.
  const matchedKeys = new Set(
    rows.map((r) => typeKey(r.audienceCategory, r.categoryId))
  );
  const otherGroups = activeGroups
    .filter(
      (g) => !matchedKeys.has(typeKey(g.audience_category, g.category_id))
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  // Unused categories: live catalog labels applied to no active cell AND not
  // referenced by any group. These surface as all-blank orphan rows in
  // Multiply, so offer an explicit Delete-category (archive) cleanup. A label
  // still applied to a group type (active cell) or still carried by a group is
  // excluded — archiving the latter would orphan those groups' label
  // ("Uncategorized" on reads), so those must be recategorized first.
  const usedCategoryIds = new Set(cells.map((c) => c.categoryId));
  // Only offer deletion when we can actually verify group references. If the
  // groups read failed, treat references as unknown and offer nothing.
  const unusedCategories = groupReferencesKnown
    ? categories
        .filter(
          (c) => !usedCategoryIds.has(c.id) && !categoryIdsWithGroups.has(c.id)
        )
        .sort((a, b) => a.label.localeCompare(b.label))
    : [];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <AddGroupTypeForm categories={categories} />

      {rows.length === 0 ? (
        <p style={emptyNoteStyle}>
          No group types yet. Use &ldquo;Add a group type&rdquo; above — pick an
          audience, type a category like &ldquo;20-30s&rdquo;, and save.
        </p>
      ) : (
        <ul style={listStyle}>
          {rows.map((row) => (
            <GroupTypeRow
              key={`${row.audienceCategory}:${row.categoryId}`}
              row={row}
              groups={
                groupsByType.get(
                  typeKey(row.audienceCategory, row.categoryId)
                ) ?? []
              }
              groupsKnown={groupReferencesKnown}
              onEdit={drawer.open}
            />
          ))}
        </ul>
      )}

      {otherGroups.length > 0 ? (
        <OtherGroups groups={otherGroups} onEdit={drawer.open} />
      ) : null}

      {unusedCategories.length > 0 ? (
        <UnusedCategories categories={unusedCategories} />
      ) : null}

      <EditingSurface
        open={drawer.isOpen}
        onRequestClose={drawer.requestClose}
        eyebrow="Edit group"
        title={editingGroup?.name ?? "Edit group"}
        description="Update this group's details. Saving affects only this group."
        closeLabel={
          editingGroup
            ? `Close ${editingGroup.name} editor`
            : "Close group editor"
        }
      >
        {editingGroup ? (
          // Keyed per group so the fields + action state reset when a different
          // group is opened, while the Dialog itself stays mounted.
          <div key={editingGroup.id} style={{ display: "grid", gap: 18 }}>
            <GroupEditForm
              group={editingGroup}
              categoriesByAudience={categoriesByAudience}
              onCancel={drawer.requestClose}
              onDirty={drawer.markDirty}
              onPendingChange={drawer.reportPending}
              onSaved={drawer.markSaved}
            />
          </div>
        ) : null}
      </EditingSurface>
    </div>
  );
}

// The (Audience × category) key a group and a group-type row share. A group with
// no audience or category resolves to an empty-part key that matches no real
// type row, so it lands in the "Other groups" catch-all.
function typeKey(
  audience: GroupAudienceCategory | null,
  categoryId: string | null
): string {
  return `${audience ?? ""}:${categoryId ?? ""}`;
}

// Cleanup for category labels applied to no active group type. Removing a
// group type leaves its shared category in the catalog (so re-adding it reuses
// the label), but a category left applied to nothing renders as an all-blank
// orphan row in Multiply. Deleting one here archives the catalog label so it
// stops surfacing; it stays in history and the action revalidates Multiply.
function UnusedCategories({
  categories,
}: {
  categories: { id: string; label: string }[];
}) {
  return (
    <section style={unusedSectionStyle}>
      <div style={unusedHeadingStyle}>Unused categories</div>
      <p style={noteStyle}>
        These category labels aren&rsquo;t applied to any group type, so they
        show as empty rows in Multiply. Delete one to remove the label (it stays
        in history), or re-add a group type above to use it again.
      </p>
      <ul style={listStyle}>
        {categories.map((c) => (
          <li key={c.id} style={unusedRowStyle}>
            <span style={{ fontFamily: fontBody, fontSize: 14, color: P.ink }}>
              {c.label}
            </span>
            <DeleteCategoryForm categoryId={c.id} label={c.label} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// Deletes (archives) an unused category label via the audited archive RPC.
function DeleteCategoryForm({
  categoryId,
  label,
}: {
  categoryId: string;
  label: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminArchiveGroupCategory
  );

  function confirmDelete(e: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Delete the category "${label}"? It's applied to no group type. It stops showing in Multiply and stays in history.`
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={confirmDelete} style={inlineFormStyle}>
      <input type="hidden" name="category_id" value={categoryId} />
      <PButton
        type="submit"
        tone="ghost"
        size="sm"
        disabled={pending}
        aria-label={`Delete unused category ${label}`}
      >
        {pending ? "Deleting…" : "Delete category"}
      </PButton>
      <FormStatus state={state} successText="Category deleted." />
    </form>
  );
}

// The "+" create flow. Hitting "+" reveals one step: pick an Audience, type a
// free-text category, save. On save it resolves the label against the shared
// catalog (reuse if it already exists, else create it through the audited create
// RPC), then applies the (Audience × category) cell through the audited apply
// RPC — the two existing writes chained, no new RPC. The flow stays open after a
// save so the admin can add another.
function AddGroupTypeForm({
  categories,
}: {
  categories: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<GroupAudienceCategory>("men");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const trimmed = label.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (trimmed.length === 0) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      // Reuse the shared category when the label already lives in the catalog;
      // otherwise create it first. The DB stays the authoritative gate — a create
      // that races another still rejects the duplicate label, surfaced here.
      const resolution = resolveCategoryForLabel(categories, trimmed);
      let categoryId: string;
      if (resolution.kind === "existing") {
        categoryId = resolution.categoryId;
      } else {
        const created = await adminCreateGroupCategory(undefined, {
          label: trimmed,
        });
        if (!created.ok) {
          setError(created.errors.join(" "));
          return;
        }
        categoryId = created.value.id;
      }
      const applied = await adminSetCategoryTypeCell(undefined, {
        category_id: categoryId,
        audience_category: audience,
        active: "true",
      });
      if (!applied.ok) {
        setError(applied.errors.join(" "));
        return;
      }
      setLabel("");
      setSaved(true);
    });
  };

  if (!open) {
    return (
      <div>
        <PButton
          type="button"
          tone="terra"
          size="md"
          onClick={() => {
            setOpen(true);
            setSaved(false);
            setError(null);
          }}
        >
          + Add a group type
        </PButton>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={addFormStyle}>
      <p style={noteStyle}>
        Pick an audience and type a category — that one step creates the group
        type. The same category typed under another audience reuses the shared
        label, so renaming it later updates both.
      </p>
      <div className="lg-m-grid-stack" style={addGridStyle}>
        <div>
          <label htmlFor="new-group-type-audience" style={fieldLabelStyle}>
            Audience
          </label>
          <select
            id="new-group-type-audience"
            value={audience}
            onChange={(e) =>
              setAudience(e.target.value as GroupAudienceCategory)
            }
            style={fieldSelectStyle}
          >
            {AUDIENCE_CATEGORIES.map((a) => (
              <option key={a} value={a}>
                {TYPE_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="new-group-type-label" style={fieldLabelStyle}>
            Category
          </label>
          <input
            id="new-group-type-label"
            type="text"
            value={label}
            placeholder="e.g. 20-30s"
            onChange={(e) => setLabel(e.target.value)}
            style={fieldInputStyle}
          />
        </div>
      </div>
      <div style={controlsRowStyle}>
        <PButton
          type="submit"
          tone="terra"
          size="md"
          disabled={pending || trimmed.length === 0}
        >
          {pending ? "Saving…" : "Save group type"}
        </PButton>
        <PButton
          type="button"
          tone="ghost"
          size="md"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setLabel("");
            setError(null);
            setSaved(false);
          }}
        >
          Done
        </PButton>
        {error ? (
          <p style={errorTextStyle}>{error}</p>
        ) : saved ? (
          <span style={successTextStyle}>Group type added.</span>
        ) : null}
      </div>
    </form>
  );
}

// One group-type row, now a native <details> disclosure so the list stays
// scannable: the summary carries the Audience badge, the category label, the
// live coverage readout, and the group count. Expanding reveals the type's
// controls (rename / target / remove — each its own audited form) and the list
// of individual groups in the type, each editable in place.
function GroupTypeRow({
  row,
  groups,
  groupsKnown,
  onEdit,
}: {
  row: CellCoverage;
  groups: GroupsRow[];
  // Whether the groups read succeeded. When it failed `groups` is an empty array
  // for the wrong reason (not "no groups"), so we show a degraded note instead of
  // a misleading "0 groups" + no edit buttons next to a live "have X of Y".
  groupsKnown: boolean;
  onEdit: (groupId: string) => void;
}) {
  const sorted = [...groups].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <li style={{ listStyle: "none" }}>
      <details style={rowStyle}>
        <summary className="lg-sac-summary" style={summaryRowStyle}>
          <Chevron />
          <span style={badgeStyle}>{TYPE_LABEL[row.audienceCategory]}</span>
          <span style={typeLabelStyle}>{row.label}</span>
          <span style={summarySpacerStyle} />
          <span style={readoutStyle} aria-live="polite">
            have {row.have} of {row.target}
          </span>
          {groupsKnown ? (
            <span style={groupCountStyle}>
              {groupCountLabel(sorted.length)}
            </span>
          ) : null}
        </summary>
        <div style={detailsBodyStyle}>
          <div style={rowIdentityStyle}>
            <RenameCategoryForm
              categoryId={row.categoryId}
              label={row.label}
              audienceCategory={row.audienceCategory}
            />
          </div>
          <div style={rowBottomStyle}>
            <TargetForm
              categoryId={row.categoryId}
              label={row.label}
              audienceCategory={row.audienceCategory}
              target={row.target}
            />
            <RemoveForm
              categoryId={row.categoryId}
              label={row.label}
              audienceCategory={row.audienceCategory}
            />
          </div>
          {groupsKnown ? (
            <GroupsInType groups={sorted} heading="Groups" onEdit={onEdit} />
          ) : (
            <p style={emptyGroupsNoteStyle}>
              This type&rsquo;s groups couldn&rsquo;t be loaded right now, so
              they can&rsquo;t be listed or edited here. The coverage above is
              still current.
            </p>
          )}
        </div>
      </details>
    </li>
  );
}

// The catch-all for active groups not under any active group-type row
// (uncategorized, or whose type was removed), so every group stays editable from
// this tab. Same collapsed disclosure shape as a type row, minus the type
// controls.
function OtherGroups({
  groups,
  onEdit,
}: {
  groups: GroupsRow[];
  onEdit: (groupId: string) => void;
}) {
  return (
    <details style={rowStyle}>
      <summary className="lg-sac-summary" style={summaryRowStyle}>
        <Chevron />
        <span style={typeLabelStyle}>Other groups</span>
        <span style={summarySpacerStyle} />
        <span style={groupCountStyle}>{groupCountLabel(groups.length)}</span>
      </summary>
      <div style={detailsBodyStyle}>
        <p style={noteStyle}>
          These groups aren&rsquo;t under an active group type (uncategorized,
          or their type was removed). Edit one to give it an audience and
          category.
        </p>
        <GroupsInType groups={groups} onEdit={onEdit} />
      </div>
    </details>
  );
}

// The list of individual groups within a disclosure. Each row shows the group's
// name + lifecycle status and an Edit button that opens the shared drawer.
function GroupsInType({
  groups,
  heading,
  onEdit,
}: {
  groups: GroupsRow[];
  heading?: string;
  onEdit: (groupId: string) => void;
}) {
  if (groups.length === 0) {
    return <p style={emptyGroupsNoteStyle}>No groups in this type yet.</p>;
  }
  return (
    <div style={groupsBlockStyle}>
      {heading ? <div style={groupsHeadingStyle}>{heading}</div> : null}
      <ul style={groupListStyle}>
        {groups.map((g) => (
          <GroupRow key={g.id} group={g} onEdit={onEdit} />
        ))}
      </ul>
    </div>
  );
}

function GroupRow({
  group,
  onEdit,
}: {
  group: GroupsRow;
  onEdit: (groupId: string) => void;
}) {
  return (
    <li style={groupRowStyle}>
      <span style={{ minWidth: 0 }}>
        <span style={groupNameStyle}>{group.name}</span>
        <span style={groupStatusStyle}>
          {group.lifecycle_status.replace(/_/g, " ")}
        </span>
      </span>
      <PButton
        type="button"
        tone="ghost"
        size="sm"
        onClick={() => onEdit(group.id)}
        aria-label={`Edit ${group.name}`}
      >
        Edit
      </PButton>
    </li>
  );
}

// The rotating disclosure chevron, reusing the Super Admin section's CSS hooks
// (.lg-sac-chevron rotates 90° when the parent <details> is open).
function Chevron() {
  return (
    <span
      className="lg-sac-chevron"
      aria-hidden="true"
      style={{ display: "inline-flex", color: P.ink3 }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M4 2l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function groupCountLabel(n: number): string {
  return n === 1 ? "1 group" : `${n} groups`;
}

// Rename the row's (shared) category. Renaming reflects across every cell of the
// category — both Audiences when the label is shared — since they point at one
// catalog row. Posts to the audited rename RPC.
function RenameCategoryForm({
  categoryId,
  label,
  audienceCategory,
}: {
  categoryId: string;
  label: string;
  audienceCategory: GroupAudienceCategory;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminRenameGroupCategory
  );
  const [draft, setDraft] = useState(label);
  const dirty = draft.trim() !== label.trim() && draft.trim().length > 0;

  return (
    <form action={formAction} style={inlineFormStyle}>
      <input type="hidden" name="category_id" value={categoryId} />
      <input
        aria-label={`Rename ${TYPE_LABEL[audienceCategory]} ${label} category`}
        name="label"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{ ...fieldInputStyle, minWidth: 150 }}
      />
      <PButton
        type="submit"
        tone="ghost"
        size="sm"
        disabled={pending || !dirty}
        aria-label={`Save ${TYPE_LABEL[audienceCategory]} ${label} name`}
      >
        {pending ? "Saving…" : "Rename"}
      </PButton>
      <FormStatus state={state} successText="Renamed." />
    </form>
  );
}

// The editable target group count (the "Y" in have X of Y) — tracking only, it
// feeds no trigger. X (have) is read-only, derived from the live groups upstream.
// Posts to the audited target-count RPC.
function TargetForm({
  categoryId,
  label,
  audienceCategory,
  target,
}: {
  categoryId: string;
  label: string;
  audienceCategory: GroupAudienceCategory;
  target: number;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminSetCategoryTypeTargetCount
  );
  const [draft, setDraft] = useState(String(target));
  const parsed = Number.parseInt(draft, 10);
  const dirty =
    draft.trim().length > 0 &&
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed !== target;

  return (
    <form action={formAction} style={inlineFormStyle}>
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="audience_category" value={audienceCategory} />
      <span style={inlineLabelStyle}>Target</span>
      <input
        aria-label={`Target for ${TYPE_LABEL[audienceCategory]} ${label}`}
        name="target_count"
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{ ...fieldInputStyle, width: 72, textAlign: "center" }}
      />
      <PButton
        type="submit"
        tone="ghost"
        size="sm"
        disabled={pending || !dirty}
        aria-label={`Save target for ${TYPE_LABEL[audienceCategory]} ${label}`}
      >
        {pending ? "Saving…" : "Set"}
      </PButton>
      <FormStatus state={state} successText="Target saved." />
    </form>
  );
}

// Remove the group type by unapplying its cell (active=false). Per the Archive
// convention the row stays (reversible) with its target/overrides; it simply
// drops out of the active list. The shared category lingers in the catalog,
// applied to no type, if this was its last cell. Posts to the audited apply RPC.
function RemoveForm({
  categoryId,
  label,
  audienceCategory,
}: {
  categoryId: string;
  label: string;
  audienceCategory: GroupAudienceCategory;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminSetCategoryTypeCell
  );

  return (
    <form action={formAction} style={inlineFormStyle}>
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="audience_category" value={audienceCategory} />
      <input type="hidden" name="active" value="false" />
      <PButton
        type="submit"
        tone="ghost"
        size="sm"
        disabled={pending}
        aria-label={`Remove ${TYPE_LABEL[audienceCategory]} ${label}`}
      >
        {pending ? "Removing…" : "Remove"}
      </PButton>
      <FormStatus state={state} />
    </form>
  );
}

const listStyle = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "grid",
  gap: 12,
} as const;

const rowStyle = {
  border: `1px solid ${P.line}`,
  borderRadius: 10,
  background: P.surface,
} as const;

const summaryRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "14px 16px",
  flexWrap: "wrap" as const,
} as const;

const detailsBodyStyle = {
  display: "grid",
  gap: 14,
  padding: "0 16px 16px",
} as const;

const typeLabelStyle = {
  fontFamily: fontBody,
  fontSize: 14,
  fontWeight: 600,
  color: P.ink,
} as const;

const summarySpacerStyle = { flex: 1 } as const;

const groupCountStyle = {
  fontFamily: fontBody,
  fontSize: 12,
  color: P.ink3,
  whiteSpace: "nowrap" as const,
} as const;

const groupsBlockStyle = {
  display: "grid",
  gap: 8,
  borderTop: `1px solid ${P.line}`,
  paddingTop: 12,
} as const;

const groupsHeadingStyle = {
  fontFamily: fontBody,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase" as const,
  color: P.ink3,
} as const;

const groupListStyle = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "grid",
  gap: 8,
} as const;

const groupRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap" as const,
  border: `1px solid ${P.line}`,
  borderRadius: 8,
  padding: "10px 12px",
  background: P.bg,
} as const;

const groupNameStyle = {
  fontFamily: fontBody,
  fontSize: 14,
  fontWeight: 500,
  color: P.ink,
} as const;

const groupStatusStyle = {
  fontFamily: fontBody,
  fontSize: 12,
  color: P.ink3,
  marginLeft: 8,
} as const;

const emptyGroupsNoteStyle = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink3,
  fontStyle: "italic" as const,
  margin: 0,
} as const;

const rowIdentityStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap" as const,
} as const;

const rowBottomStyle = {
  display: "flex",
  alignItems: "center",
  gap: 18,
  flexWrap: "wrap" as const,
} as const;

const badgeStyle = {
  fontFamily: fontBody,
  fontSize: 12,
  fontWeight: 600,
  color: "#3e4f29",
  background: P.sageSoft,
  border: "1px solid #7f9b5e",
  borderRadius: 999,
  padding: "3px 10px",
  whiteSpace: "nowrap" as const,
} as const;

const readoutStyle = {
  fontFamily: fontBody,
  fontSize: 12,
  color: P.ink3,
  whiteSpace: "nowrap" as const,
} as const;

const inlineFormStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap" as const,
} as const;

const inlineLabelStyle = {
  fontFamily: fontBody,
  fontSize: 12,
  fontWeight: 600,
  color: P.ink3,
} as const;

const addFormStyle = {
  display: "grid",
  gap: 12,
  border: `1px solid ${P.line}`,
  borderRadius: 10,
  padding: "16px 18px",
  background: P.bg,
} as const;

const addGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(140px, 220px) 1fr",
  gap: 12,
  alignItems: "end",
} as const;

const controlsRowStyle = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap" as const,
} as const;

const noteStyle = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink2,
  margin: 0,
  lineHeight: 1.55,
} as const;

const emptyNoteStyle = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink3,
  margin: 0,
  lineHeight: 1.55,
  fontStyle: "italic" as const,
} as const;

const unusedSectionStyle = {
  display: "grid",
  gap: 12,
  borderTop: `1px solid ${P.line}`,
  paddingTop: 18,
} as const;

const unusedHeadingStyle = {
  fontFamily: fontBody,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase" as const,
  color: P.ink3,
} as const;

const unusedRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap" as const,
  border: `1px solid ${P.line}`,
  borderRadius: 10,
  padding: "12px 16px",
  background: P.surface,
} as const;
