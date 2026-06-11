# Graphify architecture graphs

Graphify is used here as an architecture map, not as a dump of every file in
the repository. The repo wrapper stages a clean subset of source files into
`.graphify/stage/<slice>/`, runs the pinned Graphify CLI, then writes named
outputs under `graphify-out/`.

The default view is aggregate-first:

- `graphify-out/graph.html` mirrors `architecture-overview.html`
- `architecture-overview.html` collapses the raw graph to product domains
- `community-overview.html` collapses detected Graphify communities
- `raw-full-graph.html` keeps the complete raw graph for deep inspection only

The raw `graphify-out/graph.json` is still preserved so `graphify query` and
`graphify explain` can use the full graph data.

## Commands

| Command                  | Output                                   | Use                                                                    |
| ------------------------ | ---------------------------------------- | ---------------------------------------------------------------------- |
| `npm run graph:clean`    | `.graphify/stage/` removed               | Clear transient staging only. Generated graph outputs are left intact. |
| `npm run graph:full`     | `graphify-out/full/` plus default mirror | Rebuild raw full graph and aggregate overview files.                   |
| `npm run graph:tree`     | `GRAPH_TREE.html` for the full graph     | Regenerate the tree view from an existing graph.                       |
| `npm run graph:plan`     | `graphify-out/plan/`                     | Plan, prospect, planning, and launch pipeline slice.                   |
| `npm run graph:multiply` | `graphify-out/multiply/`                 | Multiplication readiness, capacity, launch, and leader pipeline slice. |
| `npm run graph:care`     | `graphify-out/care/`                     | Care, shepherd care, follow-ups, notes, and over-shepherd slice.       |
| `npm run graph:calendar` | `graphify-out/calendar/`                 | Calendar, attendance, events, and check-in slice.                      |
| `npm run graph:report`   | `graphify-out/GRAPH_AUDIT_REPORT.md`     | Rebuild reports and derived HTML from existing graph JSON.             |

## Architecture views

### `architecture-overview.html`

This is the default architecture map. It collapses raw nodes into these
domains:

- Auth
- Groups
- People
- Plan
- Multiply
- Care
- Calendar
- Settings
- Super Admin
- Supabase/Data
- Shared UI
- App Shell
- Leader Workspace

Node size represents total symbols in the domain. Edge width represents the
number of raw relationships between domains. Labels are visible by default.

Weak edges are hidden by default so the map opens readable. Enable `Weak Edges`
to reveal all collapsed domain relationships.

### `community-overview.html`

This collapses each detected Graphify community into one node. The node label
uses the semantic community name. Original community IDs remain in tooltips and
the selection panel.

Weak cross-community edges are hidden by default. Enable `Weak Edges` to inspect
all cross-community links.

### `raw-full-graph.html`

This is the complete raw Graphify graph. It is intentionally labeled "Raw Full
Graph" and is for deep inspection only, not for architecture overview.

## Domain drilldowns

Domain commands build smaller raw graphs under `graphify-out/domain-<name>/`.
They stage same-domain files plus immediate shared/auth/data dependencies.

```bash
npm run domain:auth
npm run domain:groups
npm run domain:people
npm run domain:plan
npm run domain:multiply
npm run domain:care
npm run domain:calendar
npm run domain:settings
npm run domain:super-admin
npm run domain:supabase
npm run domain:shared-ui
```

The architecture overview details panel also shows the matching drilldown
command for each domain.

## What is excluded

The wrapper and `.graphifyignore` exclude:

- `node_modules`, `.next`, `dist`, `build`, `out`, and `coverage`
- `app/a11y-harness`
- `graphify-out`, `.graphify`, `graphify`, and Graphify skill/tooling files
- temp folders and local agent/tooling folders
- generated files, lock files, `next-env.d.ts`, and `types/database.ts`
- docs and root markdown files
- tests unless `--include-tests` is passed

The report flags any excluded folder or generated file that still appears in a
graph so regressions are visible.

## Community labels

Manual community labels live in:

```text
graphify/community-labels.json
```

Add overrides under the matching graph name:

```json
{
  "care": {
    "13": "Shepherd Care Detail Data"
  }
}
```

Label precedence is:

1. slice override, such as `care["13"]`
2. `shared["13"]`
3. inferred label based on dominant folders, files, hubs, and feature terms
4. `Community N` fallback

Community IDs can change after a graph rebuild, so use the report to confirm
the ID before adding an override.

## Reports

Each graph output gets `GRAPH_REPORT.md` with:

- raw node count, edge count, and community count
- aggregate view counts when applicable
- top hubs
- largest communities
- inferred labels and label source
- top files per community
- suspected noise
- whether excluded folders still appear

`graphify-out/GRAPH_AUDIT_REPORT.md` summarizes all generated outputs,
including default visible edge counts for aggregate views.

## Setup

The pinned Graphify CLI version lives in `.graphify-version`. The wrapper first
looks for `graphify` on PATH, then checks the Windows Python user Scripts
location where `pip install --user graphifyy` places `graphify.exe`.

Install the pinned version if needed:

```bash
python -m pip install --user "graphifyy==$(cat .graphify-version)"
```

On Windows PowerShell:

```powershell
python -m pip install --user "graphifyy==$(Get-Content .graphify-version)"
```

## Limits

Feature and domain slicing are file-based plus limited import closure. They are
useful for architecture inspection, but they do not prove runtime reachability.
If a feature depends on a dynamic import or a string-built path, add a manual
seed pattern in `scripts/graphify.mjs` or run the full graph.

The raw full graph is still large by design. Start with
`architecture-overview.html`, then use `community-overview.html`, feature
graphs, or `domain:*` drilldowns before opening `raw-full-graph.html`.
