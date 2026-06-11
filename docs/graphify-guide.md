# Graphify Guide

The default repo graph is a clean Product Surface graph at `graphify-out/`.
There is one published graph workflow:

```bash
npm.cmd run graph:product
```

## Output Files

`npm.cmd run graph:product` writes these root outputs:

| File                                     | Purpose                                                         |
| ---------------------------------------- | --------------------------------------------------------------- |
| `graphify-out/graph.json`                | Clean file/module-level graph data.                             |
| `graphify-out/graph.html`                | Interactive clean product graph.                                |
| `graphify-out/GRAPH_REPORT.md`           | Clean graph summary, category counts, hubs, and weighted links. |
| `graphify-out/GRAPH_TREE.html`           | Product tree grouped by area and category.                      |
| `graphify-out/.graphify_labels.json`     | Deterministic category labels for graph communities.            |
| `graphify-out/PRODUCT_SURFACE_REPORT.md` | Repo-specific Product Surface analysis.                         |

## Scope

The Product Surface scope is defined in `graphify/scopes.json`. It includes
protected pages/layouts/actions, feature components, domain logic, Supabase
read adapters, RPC/write boundaries, auth/session boundaries, shared plumbing,
shared UI primitives, validation, observability/security, and vocabulary types.

It excludes tests, docs, generated DB types, `app/a11y-harness`, Graphify
output/tooling, package metadata, build output, caches, and local artifacts.

## Clean Graph Build

`scripts/graphify.mjs` uses Graphify extraction as an internal build step:

1. Select tracked files with `git ls-files`.
2. Apply the Product Surface include/exclude rules.
3. Stage the selected corpus under `.graphify/stage/product/`.
4. Run Graphify extraction and clustering on the staged corpus.
5. Collapse symbol nodes by `source_file`.
6. Collapse symbol edges into weighted file/module edges.
7. Remove self-edges after collapse.
8. Preserve the most connected files plus explicit boundary files.
9. Group lower-degree files into deterministic product-area/category buckets.
10. Write the six root `graphify-out/` outputs listed above.

The clean graph targets roughly 80-200 nodes. Shared-plumbing, shared UI
primitive, and type/vocabulary edges keep their real weights in `graph.json` but
receive lower `visual_weight` values so helper modules do not dominate the
interactive view.

## Labels

Deterministic product areas, categories, and colors live in
`graphify/community-labels.json`. The clean graph uses categories such as:

- Route/Page/Layout
- Server Action
- Feature Component
- Domain Module
- Supabase Read Adapter
- RPC/Write Boundary
- Auth/Session Boundary
- Shared Plumbing
- Shared UI Primitive
- Validation
- Observability/Security
- Type/Vocabulary

## Automation

`.husky/pre-commit` runs the normal checks, refreshes `npm run graph:product`,
and stages only the six clean root graph outputs.

`scripts/graphify-session-start.sh` also runs `npm run graph:product` in the
background for agent sessions and writes `graphify-out/.update.log`.

`.graphify/`, local cache/manifests, and generated graph subdirectories are
ignored. `graphify-out/memory/` is not deleted by the graph build.

## Setup

The pinned Graphify version is in `.graphify-version`. The package name is
`graphifyy`; the command is `graphify`.

```bash
uv tool install "graphifyy==$(cat .graphify-version)"
# or
pipx install "graphifyy==$(cat .graphify-version)"
```

On this Windows checkout, `scripts/graphify.mjs` also checks
`%APPDATA%\Python\Python312\Scripts\graphify.exe`, so
`npm.cmd run graph:product` does not require `graphify` to be on `PATH`.
