import { isUuid } from "@/lib/shared/uuid";

// Single home for Leader-care (shepherd-care) view state. This module is pure
// and unit-tested: it resolves the request params into a typed view state,
// maps them onto the canonical Care tab the shell should open on, and builds
// the bookmarkable URLs the filter chips / cross-view links point at. Every
// built URL targets the canonical Care page (`/admin/care`, #468); the legacy
// `/admin/shepherd-care` / `/admin/follow-ups` aliases still accept the same
// params and alias-render the same shell, so old bookmarks survive. See #178
// (the split), #180 (cross-view filtered linking), and #477 (the six→four tab
// consolidation).

// ——— Care shell tab keys (#477) ———

// The canonical Care shell renders exactly five tabs (#477, extended by
// ADR 0023): the Over-Shepherd accordion (default — it absorbed the Coverage
// tab's unassigned bucket and coverage-management link), the All-leaders
// roster (it absorbed the Dashboard's summary tiles + attention queue),
// Follow-ups, Recent updates, and Notes — the aggregate of every Care Note /
// Prayer Request / broad note the viewer may read, plus sealed counts. Notes
// answers "what's written that I may read", distinct from Recent updates'
// "what care activity happened" interactions feed.
export type CanonicalCareTabKey =
  | "over-shepherds"
  | "all-leaders"
  | "follow-ups"
  | "recent-interactions"
  | "notes";

// Legacy tab keys from the six-tab IA (#334) stay accepted INPUTS forever — a
// bookmarked deep link or stale caller must never 404 or select a tab that no
// longer renders. normalizeCareTabKey maps them onto the canonical four.
export type CareTabKey =
  | CanonicalCareTabKey
  | "dashboard"
  | "directory"
  | "coverage";

// The legacy→canonical tab mapping (#477):
//   • dashboard / directory → all-leaders   (one roster, one home)
//   • coverage              → over-shepherds (the accordion hosts coverage
//                             triage: the Unassigned pane + "Manage" link)
export function normalizeCareTabKey(key: CareTabKey): CanonicalCareTabKey {
  switch (key) {
    case "dashboard":
    case "directory":
      return "all-leaders";
    case "coverage":
      return "over-shepherds";
    default:
      return key;
  }
}

// The legacy `?view=` vocabulary (pre-#477 Dashboard/Directory split). Still
// resolved — and still emitted by the roster's filter chips — because the
// params are accepted inputs forever; both values now land on the merged
// All-leaders tab.
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

// The canonical Care page (#468). The legacy /admin/shepherd-care and
// /admin/follow-ups aliases still resolve (200, alias-render) for old
// bookmarks, but every URL this module emits lands on the canonical surface.
const BASE_PATH = "/admin/care";

// Build a bookmarkable Leader-care URL. The emitted `view` / `filter` /
// `coverage` params are the legacy vocabulary — accepted inputs forever, and
// resolveCareInitialTabFromParams maps them onto the canonical tabs (#477).
// Dashboard is the default view so it is omitted from the query string; "all"
// filter and an absent coverage filter are likewise omitted so the canonical
// URL stays clean.
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

// Map the Leader-care params (`view` / `filter` / `coverage`) onto the
// canonical Care tab the shell should open on (#334 drill-down fix, extended
// by #468, consolidated to four tabs by #477). The embedded widgets link via
// `buildShepherdCareViewHref` / `buildShepherdCareTriageLink`, and Home's
// Needs Attention actions emit the same param vocabulary, so the landing must
// translate the params into the matching tab or every drill-down would reopen
// the default. The legacy /admin/shepherd-care and /admin/follow-ups aliases
// run the same resolution, so old bookmarks land on the same tabs. The full
// legacy matrix:
//
//   • coverage=… (uuid / unassigned) → Over-Shepherds (the accordion absorbed
//                                       the Coverage tab: the Unassigned pane
//                                       + coverage-management link live there)
//   • view=follow-ups                → Follow-ups (the follow-up queues)
//   • view=dashboard | directory     → All leaders (the roster absorbed the
//                                       Dashboard's tiles + attention queue)
//   • filter=needs_attention         → All leaders (the filter pre-applies to
//                                       the roster, so it must land there)
//   • otherwise                      → the route's default tab (legacy keys
//                                       normalized onto the canonical four)
//
// Coverage wins over view because the legacy coverage drill-downs are
// dashboard-/directory-rooted yet are coverage-triage targets, and coverage
// triage lives in the accordion now. Unlike the post-#328 state, `filter` no
// longer only selects the tab: the page pre-applies it to the roster (#477
// restored the row filter that the #328 consolidation dropped).
export function resolveCareInitialTabFromParams(
  params: Record<string, ParamValue>,
  fallback: CareTabKey
): CanonicalCareTabKey {
  const coverage = resolveCoverageFilter(params.coverage);
  if (coverage !== undefined) return "over-shepherds";
  const view = firstValue(params.view);
  if (view === "follow-ups") return "follow-ups";
  // ADR 0023: the Notes tab's bookmarkable entry (/admin/care?view=notes).
  if (view === "notes") return "notes";
  if (view === "dashboard" || view === "directory") return "all-leaders";
  if (resolveDirectoryFilter(params.filter) === "needs_attention") {
    return "all-leaders";
  }
  return normalizeCareTabKey(fallback);
}

// Cross-view link builder (#180): map a triage target to a bookmarkable URL
// with the matching filter / coverage param pre-applied. Under the four-tab IA
// (#477) the needs-attention link lands on the All-leaders roster with the row
// filter applied, and the coverage links land on the Over-Shepherds accordion
// — see resolveCareInitialTabFromParams.
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
