// Shared input-shaping rules for the capacity assemblers (ADR 0011 follow-through).
// Pure; no I/O.
//
// The Capacity Board, the launch-planning inputs aggregator, and the per-cell
// Multiply rollup each derive the same two maps from raw rows:
//   * active members per group ("active" = membership status "active"), and
//   * group_metric_settings overrides indexed by group id.
//
// Those two loops were copied character-for-character across the three
// assemblers (capacity-board.ts, launch-planning.ts, multiplication-config-reads.ts
// even labelled its copy "the capacity-board count idiom"). "Active member" is a
// domain rule: a change to it — a second active-ish status, counting co-leaders —
// must land in one place, or the Capacity Board and launch-planning will silently
// disagree about the same group.
//
// ADR 0011 still holds: the assemblers keep their own distinct OUTPUT rows. Only
// this shared INPUT rule lives behind one interface — the seam ADR 0011 invited
// when it said to revisit "if a second concrete rule turns out to be copied across
// the assemblers."

// Count active memberships per group id. A membership counts only when its status
// is exactly "active"; the returned map is keyed by group_id, and an absent group
// reads as 0 at the call site (`map.get(id) ?? 0`).
export function countActiveMembersByGroup(
  memberships: readonly { group_id: string; status: string | null }[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of memberships) {
    if (m.status !== "active") continue;
    counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
  }
  return counts;
}

// Index override rows by their group id. Last write wins on a duplicate group_id
// (there is one settings row per group, so duplicates are not expected). Generic
// over the override shape so each assembler keeps its own narrowed row type.
export function indexOverridesByGroup<O extends { group_id: string }>(
  overrides: readonly O[]
): Map<string, O> {
  const byGroup = new Map<string, O>();
  for (const o of overrides) byGroup.set(o.group_id, o);
  return byGroup;
}
