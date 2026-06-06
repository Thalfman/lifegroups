"use client";

import { useState } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  adminCreateGroupCategory,
  adminRenameGroupCategory,
  adminArchiveGroupCategory,
  adminSetCategoryTypeCell,
  adminSetCategoryTypeTargetCount,
} from "@/app/(protected)/admin/settings/actions";
import { P, fontBody } from "@/lib/pastoral";
import {
  fieldInputStyle,
  fieldLabelStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  MATRIX_TYPES,
  type CategoryMatrix,
} from "@/lib/admin/group-category-matrix";
import type { CellCoverage } from "@/lib/admin/cell-coverage";
import type { GroupAudienceCategory } from "@/types/enums";

// Settings > Groups catalog + matrix editor (#396 / PRD §2.1, #400 / PRD §2.3).
// One client component owns the whole tab: the free-form catalog (create /
// rename / archive) AND the (top type × category) matrix grid. Rows = categories,
// columns = the three top types; each cell is a toggle that applies/unapplies the
// category to that type (activating/deactivating the cell). #400 adds, inside
// each ACTIVE cell, a live "currently X / target Y" readout and an editable
// target input. Each write is its own audited RPC, posted through a small action
// form — there is no client-side batching, so every toggle, rename and target
// edit round-trips through the server's authoritative gate.

const TYPE_LABEL: Record<GroupAudienceCategory, string> = {
  men: "Men's",
  women: "Women's",
  mixed: "Mixed",
};

// Key a cell by its (top type, category) pair, matching the coverage row key, so
// each active cell's toggle can look up its "have X of Y".
function coverageKey(
  audienceCategory: GroupAudienceCategory,
  categoryId: string
): string {
  return `${audienceCategory}:${categoryId}`;
}

export function GroupsCatalogEditor({
  matrix,
  cellCoverage,
}: {
  matrix: CategoryMatrix;
  cellCoverage: CellCoverage[];
}) {
  // Index coverage by (type, category) so each active cell reads its own X/Y in
  // O(1). Only active cells have coverage rows, so an off cell looks up nothing.
  const coverageByKey = new Map(
    cellCoverage.map((row) => [
      coverageKey(row.audienceCategory, row.categoryId),
      row,
    ])
  );

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <CreateCategoryForm />

      {matrix.rows.length === 0 ? (
        <p style={emptyNoteStyle}>
          No categories yet. Add one above — for example &ldquo;20-30s&rdquo; —
          then apply it to the top types it belongs under.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "left" }}>Category</th>
                {MATRIX_TYPES.map((type) => (
                  <th key={type} style={thStyle} scope="col">
                    {TYPE_LABEL[type]}
                  </th>
                ))}
                <th style={thStyle} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <CategoryRow
                  key={row.categoryId}
                  categoryId={row.categoryId}
                  label={row.label}
                  cells={row.cells}
                  coverageByKey={coverageByKey}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// The "add a category" form — a single free-form label field. On success the
// server revalidates Settings, so the new category appears as a fresh row.
function CreateCategoryForm() {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminCreateGroupCategory,
    { resetOnSuccess: true }
  );
  const [label, setLabel] = useState("");

  return (
    <form
      action={formAction}
      style={{ display: "grid", gap: 10 }}
      onSubmit={() => setLabel("")}
    >
      <p style={noteStyle}>
        Add a free-form category label. The same label can apply to more than
        one top type.
      </p>
      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 12,
          alignItems: "end",
        }}
      >
        <div>
          <label htmlFor="new-category-label" style={fieldLabelStyle}>
            New category
          </label>
          <input
            id="new-category-label"
            name="label"
            type="text"
            value={label}
            placeholder="e.g. 20-30s"
            onChange={(e) => setLabel(e.target.value)}
            style={fieldInputStyle}
          />
        </div>
        <PButton
          type="submit"
          tone="terra"
          size="md"
          disabled={pending || label.trim().length === 0}
        >
          {pending ? "Adding…" : "Add category"}
        </PButton>
      </div>
      <FormStatus state={state} successText="Category added." />
    </form>
  );
}

// One matrix row: the category's rename field + archive control, plus the three
// cell toggles. Rename and archive are their own forms; each cell toggle posts
// its own apply/unapply.
function CategoryRow({
  categoryId,
  label,
  cells,
  coverageByKey,
}: {
  categoryId: string;
  label: string;
  cells: Record<GroupAudienceCategory, { active: boolean }>;
  coverageByKey: Map<string, CellCoverage>;
}) {
  return (
    <tr>
      <td style={{ ...tdStyle, textAlign: "left" }}>
        <RenameCategoryForm categoryId={categoryId} label={label} />
      </td>
      {MATRIX_TYPES.map((type) => (
        <td key={type} style={tdStyle}>
          <CellToggle
            categoryId={categoryId}
            categoryLabel={label}
            audienceCategory={type}
            active={cells[type].active}
            coverage={coverageByKey.get(coverageKey(type, categoryId)) ?? null}
          />
        </td>
      ))}
      <td style={tdStyle}>
        <ArchiveCategoryForm categoryId={categoryId} label={label} />
      </td>
    </tr>
  );
}

function RenameCategoryForm({
  categoryId,
  label,
}: {
  categoryId: string;
  label: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminRenameGroupCategory
  );
  const [draft, setDraft] = useState(label);
  const dirty = draft.trim() !== label.trim() && draft.trim().length > 0;

  return (
    <form action={formAction} style={{ display: "grid", gap: 6 }}>
      <input type="hidden" name="category_id" value={categoryId} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          aria-label={`Rename ${label}`}
          name="label"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ ...fieldInputStyle, minWidth: 140 }}
        />
        <PButton
          type="submit"
          tone="ghost"
          size="sm"
          disabled={pending || !dirty}
          aria-label={`Save ${label} name`}
        >
          {pending ? "Saving…" : "Rename"}
        </PButton>
      </div>
      <FormStatus state={state} successText="Renamed." />
    </form>
  );
}

function ArchiveCategoryForm({
  categoryId,
  label,
}: {
  categoryId: string;
  label: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminArchiveGroupCategory
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: 6 }}>
      <input type="hidden" name="category_id" value={categoryId} />
      <PButton
        type="submit"
        tone="ghost"
        size="sm"
        disabled={pending}
        aria-label={`Remove ${label}`}
      >
        {pending ? "Removing…" : "Remove"}
      </PButton>
      <FormStatus state={state} />
    </form>
  );
}

// One cell's apply/unapply toggle. Posts the category, the top type, and the
// NEXT active state (the opposite of the current one). The button reads as an
// on/off pill; aria-pressed carries the active state for assistive tech. When the
// cell is ACTIVE it also shows the #400 coverage readout + editable target input
// underneath.
function CellToggle({
  categoryId,
  categoryLabel,
  audienceCategory,
  active,
  coverage,
}: {
  categoryId: string;
  categoryLabel: string;
  audienceCategory: GroupAudienceCategory;
  active: boolean;
  coverage: CellCoverage | null;
}) {
  const { formAction, pending } = useActionForm<{ id: string }>(
    adminSetCategoryTypeCell
  );

  return (
    <div style={{ display: "inline-grid", gap: 8, justifyItems: "center" }}>
      <form action={formAction} style={{ display: "inline-grid" }}>
        <input type="hidden" name="category_id" value={categoryId} />
        <input
          type="hidden"
          name="audience_category"
          value={audienceCategory}
        />
        {/* Post the OPPOSITE of the current state — clicking toggles the cell. */}
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <button
          type="submit"
          disabled={pending}
          aria-pressed={active}
          aria-label={`${active ? "Unapply" : "Apply"} ${categoryLabel} to ${
            TYPE_LABEL[audienceCategory]
          }`}
          style={active ? { ...toggleStyle, ...toggleOnStyle } : toggleStyle}
        >
          {active ? "Active" : "Off"}
        </button>
      </form>
      {/* #400 / PRD §2.3: an active cell carries its "currently X / target Y"
          readout and an editable target input. An off cell has no coverage row,
          so nothing renders below the toggle. */}
      {active && coverage ? (
        <CellTargetForm
          categoryId={categoryId}
          categoryLabel={categoryLabel}
          audienceCategory={audienceCategory}
          have={coverage.have}
          target={coverage.target}
        />
      ) : null}
    </div>
  );
}

// #400: the inline "currently X / target Y" readout + editable target input for
// one active cell. Posts the new target to the audited target-count RPC; the
// server revalidates Settings so the readout refreshes. X (have) is read-only —
// it's derived from the live groups, not editable here.
function CellTargetForm({
  categoryId,
  categoryLabel,
  audienceCategory,
  have,
  target,
}: {
  categoryId: string;
  categoryLabel: string;
  audienceCategory: GroupAudienceCategory;
  have: number;
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
    <form action={formAction} style={{ display: "grid", gap: 4 }}>
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="audience_category" value={audienceCategory} />
      <div style={readoutStyle} aria-live="polite">
        currently {have} / target {target}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          aria-label={`Target for ${categoryLabel} ${TYPE_LABEL[audienceCategory]}`}
          name="target_count"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ ...fieldInputStyle, width: 64, textAlign: "center" }}
        />
        <PButton
          type="submit"
          tone="ghost"
          size="sm"
          disabled={pending || !dirty}
          aria-label={`Save target for ${categoryLabel} ${TYPE_LABEL[audienceCategory]}`}
        >
          {pending ? "Saving…" : "Set"}
        </PButton>
      </div>
      <FormStatus state={state} successText="Target saved." />
    </form>
  );
}

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontFamily: fontBody,
} as const;

// #400: the "currently X / target Y" readout under an active cell's toggle.
const readoutStyle = {
  fontFamily: fontBody,
  fontSize: 11,
  color: P.ink3,
  whiteSpace: "nowrap" as const,
} as const;

const thStyle = {
  fontFamily: fontBody,
  fontSize: 12,
  fontWeight: 600,
  color: P.ink3,
  textAlign: "center" as const,
  padding: "8px 12px",
  borderBottom: `1px solid ${P.line}`,
  whiteSpace: "nowrap" as const,
} as const;

const tdStyle = {
  padding: "10px 12px",
  borderBottom: `1px solid ${P.line}`,
  textAlign: "center" as const,
  verticalAlign: "top" as const,
} as const;

const toggleStyle = {
  appearance: "none" as const,
  border: `1px solid ${P.line}`,
  background: P.surface,
  color: P.ink3,
  fontFamily: fontBody,
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 14px",
  borderRadius: 999,
  cursor: "pointer",
  minWidth: 64,
} as const;

const toggleOnStyle = {
  background: P.sageSoft,
  borderColor: "#7f9b5e",
  color: "#3e4f29",
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
