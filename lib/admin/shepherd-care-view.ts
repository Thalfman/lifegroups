import { isUuid } from "@/lib/shared/uuid";

// Single home for Leader-care (shepherd-care) view state. The page is one route
// (`/admin/shepherd-care`) and one nav item; a `?view=` param selects between a
// triage Dashboard and the searchable Directory. This module is pure and
// unit-tested: it resolves the request params into a typed view state and builds
// the bookmarkable URLs the toggle / cross-view links point at. See #178 (the
// split) and #180 (cross-view filtered linking).

// Which surface of the Leader-care page is shown. Dashboard is the default and
// the fallback for any absent/unrecognised `view` value.
export type ShepherdCareView = "dashboard" | "directory";

// The directory's needs-attention filter.
export type DirectoryFilter = "all" | "needs_attention";

// Coverage filter: a lowercased over-shepherd uuid, the literal "unassigned",
// or null. Resolution returns `undefined` for "any" (no coverage filter).
export type CoverageFilter = string | null;

export interface ShepherdCareViewState {
  view: ShepherdCareView;
  filter: DirectoryFilter;
  coverage: CoverageFilter | undefined;
}

type ParamValue = string | string[] | undefined;

function firstValue(value: ParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

// Absent or unrecognised `view` renders the Dashboard.
export function resolveShepherdCareView(value: ParamValue): ShepherdCareView {
  return firstValue(value) === "directory" ? "directory" : "dashboard";
}

export function resolveDirectoryFilter(value: ParamValue): DirectoryFilter {
  return firstValue(value) === "needs_attention" ? "needs_attention" : "all";
}

export function resolveCoverageFilter(
  value: ParamValue
): CoverageFilter | undefined {
  const raw = firstValue(value);
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (raw === "unassigned") return "unassigned";
  if (isUuid(raw)) return raw.toLowerCase();
  return undefined;
}

// Resolve the request search params into the typed view state that drives both
// the directory read and the dashboard model.
export function resolveShepherdCareViewState(
  params: Record<string, ParamValue>
): ShepherdCareViewState {
  return {
    view: resolveShepherdCareView(params.view),
    filter: resolveDirectoryFilter(params.filter),
    coverage: resolveCoverageFilter(params.coverage),
  };
}

// A triage entry point on the Dashboard. The Dashboard is a scan surface; each
// of these targets is somewhere you go to *act*, so they all resolve to a
// filtered Directory view (#180).
export type ShepherdCareTriageTarget =
  | { kind: "needs_attention" }
  | { kind: "unassigned" }
  | { kind: "over_shepherd"; overShepherdId: string };

const BASE_PATH = "/admin/shepherd-care";

// Build a bookmarkable Leader-care URL. Dashboard is the default view so it is
// omitted from the query string; "all" filter and an absent coverage filter are
// likewise omitted so the canonical URL stays clean.
export function buildShepherdCareViewHref(state: {
  view: ShepherdCareView;
  filter?: DirectoryFilter;
  coverage?: CoverageFilter | undefined;
}): string {
  const qs = new URLSearchParams();
  if (state.view === "directory") qs.set("view", "directory");
  if (state.filter && state.filter !== "all") qs.set("filter", state.filter);
  if (state.coverage !== undefined && state.coverage !== null) {
    qs.set("coverage", state.coverage);
  }
  const s = qs.toString();
  return s.length === 0 ? BASE_PATH : `${BASE_PATH}?${s}`;
}

// Cross-view link builder (#180): map a Dashboard triage target to the
// bookmarkable Directory-view URL with the matching filter / coverage param
// pre-applied, so a click on a summary card or attention item lands you in the
// Directory ready to act.
export function buildShepherdCareTriageLink(
  target: ShepherdCareTriageTarget
): string {
  switch (target.kind) {
    case "needs_attention":
      return buildShepherdCareViewHref({
        view: "directory",
        filter: "needs_attention",
      });
    case "unassigned":
      return buildShepherdCareViewHref({
        view: "directory",
        coverage: "unassigned",
      });
    case "over_shepherd":
      return buildShepherdCareViewHref({
        view: "directory",
        coverage: target.overShepherdId,
      });
  }
}
