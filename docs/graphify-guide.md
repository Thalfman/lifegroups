# Graphify: what it is and how to use it

A plain-English guide to the knowledge graph that lives in `graphify-out/`.
No prior context assumed.

## What is this?

[Graphify](https://github.com/safishamsi/graphify) scans the codebase and
builds a **knowledge graph** of it: every function, component, table, and doc
becomes a _node_, and every "X calls Y" / "X imports Y" relationship becomes
an _edge_. The result is a map of the whole app (~4,900 nodes, ~14,100 edges)
that both humans and AI assistants can query instead of grepping through raw
files.

Everything it produces lives in `graphify-out/`:

| File              | What it is                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `graph.json`      | The raw graph data. Machine-readable; powers everything else. You never read this directly.                             |
| `GRAPH_REPORT.md` | A human-readable summary: the most connected "god nodes", surprising connections, suggested questions. Good first read. |
| `graph.html`      | 🔍 **The interactive graph** — every node and edge, explorable in a browser.                                            |
| `GRAPH_TREE.html` | 🌳 A collapsible folder-tree view — like a file explorer, but each file expands into its symbols.                       |
| `CALLFLOW.html`   | 🔀 Architecture flow diagrams (Mermaid) — how calls flow between the big parts of the system.                           |
| `memory/`         | Saved question-and-answer results that get folded back into the graph (see "Memory loop" below).                        |
| `cache/`          | Machine-local extraction cache. Gitignored — ignore it.                                                                 |

All of these except `cache/` are **committed to the repo** and refreshed
automatically (see "How it stays updated").

## How to view the HTML graphs

The three `.html` files are plain web pages — no server, no build step. They
do load their chart libraries (vis-network, D3, Mermaid) from public CDNs, so
you need an internet connection for them to render; on an offline machine the
pages will open but stay blank.

1. Pull the repo (`git pull`).
2. Open the file in any browser:
   - **macOS:** `open graphify-out/graph.html`
   - **Windows:** `start graphify-out\graph.html` (or just double-click it in Explorer)
   - **Linux:** `xdg-open graphify-out/graph.html`

> **Note:** GitHub's website will _not_ render these pages — clicking
> `graph.html` on github.com shows you source code, not the graph. You have to
> open them from a local checkout (or download the raw file and open it).

### What each page gives you

- **`graph.html` — the interactive graph.** The whole codebase as a zoomable
  node-and-edge map. Scroll to zoom, drag to pan, click a node to see its
  details and connections. Colors are _communities_ — clusters of code that
  belong together. (They have placeholder names like "Community 12" until an
  LLM API key is configured; the structure is still meaningful.) This is the
  biggest page (~5 MB) and the densest — give it a few seconds to settle.
- **`GRAPH_TREE.html` — the tree.** Starts at the repo root; click folders to
  expand them down to files and the functions/components inside. Each symbol
  has an inspector showing what it calls. Best for "what's in this part of the
  app?"
- **`CALLFLOW.html` — the flow diagrams.** A page of architecture diagrams
  showing how calls flow between major areas, with zoom/pan controls and call
  tables. Best for "how does data move through the system?"

## How to ask it questions (CLI)

If you have the `graphify` CLI installed (see Setup below), you can query the
graph from the repo root without opening anything:

```bash
# "How does X work?" — returns a small, focused subgraph
graphify query "how does the care notes transparency toggle work"

# "What is X?" — plain-language explanation of one node and its neighbors
graphify explain "run-action"

# "How are A and B connected?"
graphify path "leader surface flag" "super admin console"

# "What breaks if I change X?" — reverse-impact, run before touching shared code
graphify affected "lib/admin/run-action.ts"
```

These are also the commands AI assistants (Claude, etc.) are nudged to use in
this repo instead of grepping — same graph, same answers.

### Memory loop

When a session produces a non-obvious architecture answer, it can be saved
back into the graph so the next question benefits:

```bash
graphify save-result --question "…" --answer "…" --nodes <label> …
```

Entries land in `graphify-out/memory/` (committed) and are re-ingested on the
next graph update.

## How it stays updated

**You normally do nothing.** Two hooks keep everything fresh:

1. **The pre-commit hook** (`.husky/pre-commit`): every time anyone commits,
   it re-scans the code (`graphify update .` — fast, AST-only, no API key
   needed) and stages the refreshed `graph.json`, `GRAPH_REPORT.md`, and — when
   the graph actually changed — the three HTML pages into that same commit. So
   whatever is on `main` always describes the code on `main`.
2. **A Claude Code session-start hook** installs the CLI if missing and
   refreshes the graph in the background when an AI session begins.

The hook deliberately **skips** the refresh (without blocking your commit) when:

- the `graphify` CLI isn't installed, or its version doesn't match the one
  pinned in `.graphify-version` (keeps the committed artifacts reproducible);
- you're making a _partial_ commit (unstaged changes exist) — so the committed
  graph never describes uncommitted work.

In those cases the graph simply catches up on the next full commit from a
machine that has the right CLI.

### Manual refresh commands

| Command                 | When to use it                                                                   |
| ----------------------- | -------------------------------------------------------------------------------- |
| `graphify update .`     | Re-scan after code changes (the pre-commit hook runs this for you).              |
| `npm run graph:rebuild` | After a refactor that _deleted_ code — forces a full rebuild (`update --force`). |
| `npm run graph:tree`    | Regenerate `GRAPH_TREE.html` only.                                               |
| `npm run graph:flow`    | Regenerate `CALLFLOW.html` only.                                                 |
| `npm run graph:health`  | Diagnostics: multigraph check + token-reduction benchmark.                       |

One quirk: this graph is over graphify's default 5,000-node limit for the
HTML viz, so regenerating `graph.html` by hand needs the limit raised:

```bash
GRAPHIFY_VIZ_NODE_LIMIT=10000 graphify update . --force
```

(The pre-commit hook already sets this for you.)

## Setup (one-time, per machine)

The CLI is a Python tool. The pinned version lives in `.graphify-version`
(currently `0.8.36`) — the hooks refuse to write graph artifacts with any
other version, so install exactly that:

```bash
uv tool install "graphifyy==$(cat .graphify-version)"
# or, without uv:
pipx install "graphifyy==$(cat .graphify-version)"
```

(The package is `graphifyy` — two y's — but the command is `graphify`.)

Verify: `graphify --version` should print the pinned version.

## Troubleshooting

- **"graphify on PATH is not the version in .graphify-version; skipping graph
  refresh" at commit time** — your installed CLI doesn't match the pin.
  Reinstall with the pinned version (above). Your commit still went through;
  only the graph refresh was skipped.
- **"unstaged or untracked files present; skipping graph refresh"** — you made
  a partial commit. Expected; the graph catches up on the next clean commit.
- **Merge conflict on `graph.json`** — a custom merge driver usually handles
  this. If you hit one on a machine _without_ graphify installed: take either
  side, finish the merge, and let the next pre-commit regenerate it.
- **`graph.html` feels slow in the browser** — it's a ~6,600-node force layout;
  give it a moment to settle, and prefer `GRAPH_TREE.html` for quick lookups.
- **Community names are "Community N"** — expected until an LLM API key is
  available; run `graphify label .` once one is configured.

## What's deliberately _not_ in the graph

Corpus scope is controlled by `.graphifyignore` — tooling directories,
secrets, prose documentation (`docs/`, root markdown, `.github/`), and
(until fixed upstream) `*.sh` scripts are excluded, so the graph describes
the code architecture only. The `graphify-out/memory/` loop still re-ingests
saved answers. See the comments in that file.
