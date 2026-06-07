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
import type { CellCoverage } from "@/lib/admin/cell-coverage";
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
            />
          ))}
        </ul>
      )}

      {unusedCategories.length > 0 ? (
        <UnusedCategories categories={unusedCategories} />
      ) : null}
    </div>
  );
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

// One group-type row: the Audience badge, the (shared) category rename, the live
// coverage readout, then the editable target and the remove control. Each write
// is its own audited form.
function GroupTypeRow({ row }: { row: CellCoverage }) {
  return (
    <li style={rowStyle}>
      <div style={rowTopStyle}>
        <div style={rowIdentityStyle}>
          <span style={badgeStyle}>{TYPE_LABEL[row.audienceCategory]}</span>
          <RenameCategoryForm
            categoryId={row.categoryId}
            label={row.label}
            audienceCategory={row.audienceCategory}
          />
        </div>
        <span style={readoutStyle} aria-live="polite">
          have {row.have} of {row.target}
        </span>
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
    </li>
  );
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
  padding: "14px 16px",
  background: P.surface,
  display: "grid",
  gap: 12,
} as const;

const rowTopStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap" as const,
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
