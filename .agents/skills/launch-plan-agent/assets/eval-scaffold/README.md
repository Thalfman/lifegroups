# Eval scaffold

Copy this into `my-plan-agent/evals/` when you reach Phase 3.

```
evals/
├── cases/
│   └── <case-name>/
│       ├── input.md       # the task/context handed to the agent
│       └── expected.md    # what a good answer must contain (the rubric)
├── results-v1.json        # written by scripts/run-eval.sh (see schema)
└── baseline.json          # the first passing results, kept as regression ref
```

Workflow:

1. Write 2–3 cases under `cases/`.
2. Run `scripts/run-eval.sh <agent-name> <repo-dir>` → `results-v<N>.json`.
3. Read the verdict, change **one** thing (prompt / tools / model / task),
   bump N, re-run.
4. When a version passes, copy its results to `baseline.json`.
