# Graphify query reference

Use this when `graphify-out/graph.json` exists.

```bash
graphify query "<question>"
graphify query "<question>" --dfs
graphify query "<question>" --budget 1500
graphify path "<source concept>" "<target concept>"
graphify explain "<node>"
```

Answer from the graph output first. Prefer graph source locations over raw-file searching. If the graph is stale, run `graphify . --update` before querying.
