# Graphify architecture graphs

Graphify is used here as an architecture map, not as a dump of every file in
the repository. The repo wrapper stages a clean subset of source files into
`.graphify/stage/<slice>/`, runs the pinned Graphify CLI, then writes named
outputs under `graphify-out/<slice>/`.

The default full graph is also mirrored to `graphify-out/graph.json`,
`graphify-out/graph.html`, `graphify-out/GRAPH_REPORT.md`, and
`graphify-out/GRAPH_TREE.html` so `graphify query`, `graphify explain`, and
older docs keep working.

## Commands

| Command                  | Output                                   | Use                                                                    |
| ------------------------ | ---------------------------------------- | ---------------------------------------------------------------------- |
| `npm run graph:clean`    | `.graphify/stage/` removed               | Clear transient staging only. Generated graph outputs are left intact. |
| `npm run graph:full`     | `graphify-out/full/` plus default mirror | Full code architecture graph.                                          |
| `npm run graph:tree`     | `GRAPH_TREE.html` for the full graph     | Regenerate the tree view from an existing graph.                       |
| `npm run graph:plan`     | `graphify-out/plan/`                     | Plan, prospect, planning, and launch pipeline slice.                   |
| `npm run graph:multiply` | `graphify-out/multiply/`                 | Multiplication readiness, capacity, launch, and leader pipeline slice. |
| `npm run graph:care`     | `graphify-out/care/`                     | Care, shepherd care, follow-ups, notes, and over-shepherd slice.       |
| `npm run graph:calendar` | `graphify-out/calendar/`                 | Calendar, attendance, events, and check-in slice.                      |
| `npm run graph:report`   | `graphify-out/GRAPH_AUDIT_REPORT.md`     | Rebuild reports from existing graph outputs.                           |

You can regenerate a slice tree with:

```bash
npm run graph:tree -- care
```

You can include tests for a one-off graph with:

```bash
node scripts/graphify.mjs build care --include-tests
```

Tests are excluded by default because they dominated the previous graph and
made feature architecture hard to inspect.

## What is excluded

The wrapper and `.graphifyignore` exclude:

- `node_modules`, `.next`, `dist`, `build`, `out`, and `coverage`
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

## Viewing the graph

Open `graphify-out/<slice>/graph.html` in a browser. It uses vis-network from
a public CDN, so the HTML can open locally but needs network access for the
library to load.

The HTML avoids label clutter by default:

- hub labels are shown
- all labels are hidden unless `Show Labels` is enabled
- selecting a community labels that community
- selecting a node labels its neighbors
- zooming in reveals more local labels

Edges are also quiet by default:

- edge labels are hidden unless `Edge Labels` is enabled
- hovering an edge shows the relationship details
- selecting an edge shows source, target, relation, context, confidence, and
  source location in the side panel when Graphify exposed that data

## Reports

Each graph output gets `GRAPH_REPORT.md` with:

- node count, edge count, and community count
- top hubs
- largest communities
- inferred labels and label source
- top files per community
- suspected noise
- whether excluded folders still appear

`graphify-out/GRAPH_AUDIT_REPORT.md` summarizes all generated outputs.

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

Feature slicing is file-based plus local import closure. It gives smaller,
more readable architecture graphs, but it does not prove runtime reachability.
If a feature depends on a dynamic import or a string-built path, add a manual
seed pattern in `scripts/graphify.mjs` or run the full graph.

The full graph is still large. Prefer `graph:care`, `graph:plan`,
`graph:multiply`, and `graph:calendar` for day-to-day architecture review.
