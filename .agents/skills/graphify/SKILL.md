---
name: graphify
description: Use for `/graphify` requests and for codebase architecture questions when `graphify-out/` exists. Turns code, docs, schemas, papers, images, or videos into a persistent knowledge graph with report, JSON, and HTML outputs.
trigger: /graphify
---

# /graphify

Graphify maps a folder into a queryable knowledge graph. The upstream project is `https://github.com/safishamsi/graphify`; the official PyPI package is `graphifyy` and the CLI command is `graphify`.

## Quick behavior

- If the user asks for `/graphify --help` or `/graphify -h`, print the usage block below and stop.
- If `graphify-out/graph.json` already exists and the user asks a natural-language codebase question, run `graphify query "<question>"` before reading raw files.
- If no path is provided for a build, use `.`.
- If a path starts with `https://github.com/` or `http://github.com/`, use Graphify's clone flow before building.
- Never invent graph edges. Use `AMBIGUOUS` when uncertain.
- Always show token/cost information when Graphify reports it.

## Usage

```bash
/graphify
/graphify <path>
/graphify https://github.com/<owner>/<repo>
/graphify https://github.com/<owner>/<repo> --branch <branch>
/graphify <path> --mode deep
/graphify <path> --update
/graphify <path> --cluster-only
/graphify <path> --directed
/graphify <path> --no-viz
/graphify <path> --svg
/graphify <path> --graphml
/graphify <path> --wiki
/graphify query "<question>"
/graphify query "<question>" --dfs
/graphify query "<question>" --budget 1500
/graphify path "<source concept>" "<target concept>"
/graphify explain "<node>"
/graphify add <url>
/graphify <path> --watch
```

## Ensure Graphify is installed

Prefer `uv tool install graphifyy` because it isolates the Python environment and puts `graphify` on `PATH`.

```bash
if ! command -v graphify >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then
    uv tool install graphifyy
  elif command -v pipx >/dev/null 2>&1; then
    pipx install graphifyy
  else
    python3 -m pip install --user graphifyy
  fi
fi
```

For optional inputs, install the matching extra, for example `uv tool install "graphifyy[sql]"`, `uv tool install "graphifyy[postgres]"`, `uv tool install "graphifyy[pdf]"`, or `uv tool install "graphifyy[all]"`.

## Build flow

1. Resolve the target path (default `.`).
2. Run `graphify <path>` with any user-provided flags.
3. When complete, report the generated outputs:
   - `graphify-out/graph.html` — interactive graph.
   - `graphify-out/GRAPH_REPORT.md` — summary, god nodes, surprising connections, suggested questions.
   - `graphify-out/graph.json` — queryable graph data.
4. Paste only the most useful sections from `GRAPH_REPORT.md` (usually God Nodes, Surprising Connections, Suggested Questions), not the entire report.
5. Offer one useful follow-up query.

## Query flow

When `graphify-out/graph.json` exists:

```bash
graphify query "<question>"
```

Use the graph output as the primary source. Cite source locations from the graph output when present. If `graphify query` is unavailable but `graphify-out/graph.json` exists, explain that the CLI is missing and ask the user to install `graphifyy` or run the install command above.

## Update and maintenance

- `graphify <path> --update` re-extracts changed/new files.
- `graphify <path> --cluster-only` reruns clustering on the existing graph.
- `graphify add <url>` fetches a URL into the corpus and updates the graph.
- `graphify <path> --watch` watches for changes and rebuilds automatically.

## Repo-local notes

This repository has the Graphify skill installed project-locally under `.agents/skills/graphify/`. Generated graph outputs live in `graphify-out/` when someone runs Graphify; do not commit generated outputs unless the project explicitly asks for them.
