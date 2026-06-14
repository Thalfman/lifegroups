import type { GroupAudienceCategory } from "@/types/enums";

// The Cell coordinate (CONTEXT.md › Cell coordinate): the bare identity of a
// Cell — its Audience × `category_id` pair — distinct from the live Cell unit,
// which also carries target, coverage, capacity, and readiness. This is the one
// home for that identity and its canonical map-key string.
//
// Why one home: the same (Audience × category) coordinate was keyed five ways
// across the Multiply surface — `:` (interest, coverage, health, grid), `::`
// (the capacity read), and `|` (the group-type picker) — so the grid loader had
// to juggle encodings to look one cell up across four per-cell maps. Both
// coordinates are collision-safe (`category_id` is a UUID, Audience an enum), so
// the separator was never load-bearing; it is now an implementation detail
// behind `cellKey`, and every per-cell map agrees without translating.
//
// Deliberately NOT folded in: the trigger's encodeLevel/decodeLevel
// (lib/admin/multiply-trigger.ts). That round-trips a global | type | cell UI
// selection through a form value and parses it back — a tagged-union codec, a
// different concept than a cell map key.
//
// Nullable parts live here too: a group with no Audience and/or no category is
// uncategorized — in no cell — but still needs a stable key (e.g. to bucket it
// into a catch-all next to the real cells). `cellKeyOf` owns that case, so the
// `:` separator never has to be re-spelled at a call site that handles nulls.

export type CellCoordinate = {
  audience: GroupAudienceCategory;
  categoryId: string;
};

// The canonical map-key string for a Cell coordinate — the single place the
// encoding lives, so every per-cell map keys the same way.
export function cellKey(coord: CellCoordinate): string {
  return composeCellKey(coord.audience, coord.categoryId);
}

// Lenient sibling of `cellKey` for a possibly-uncategorized group. When both
// parts are present this equals `cellKey({ audience, categoryId })`; a null part
// yields an empty-part key that collides with NO real cell (real keys are
// `enum:uuid`, both parts non-empty), so an uncategorized group lands in the
// catch-all. The one home for the nullable encoding — callers that key nullable
// parts route through here instead of re-spelling the separator.
export function cellKeyOf(
  audience: GroupAudienceCategory | null,
  categoryId: string | null
): string {
  return composeCellKey(audience ?? "", categoryId ?? "");
}

// The shared composer both keyers build on, kept private so the separator is an
// implementation detail of this module alone.
function composeCellKey(audience: string, categoryId: string): string {
  return `${audience}:${categoryId}`;
}
