import { fileURLToPath } from "node:url";

// Bits both vitest runners share: the repo root, the `@` path alias, and the
// `node` test environment. Each runner keeps its own `include`/`exclude` globs
// inline + explicit — those disjoint globs are a guardrail (the unit lane never
// touches the live-stack integration lane), so they deliberately do NOT live
// here.
export const rootDir = fileURLToPath(new URL(".", import.meta.url));

export const sharedAlias = {
  "@": rootDir,
} as const;

export const sharedTest = {
  environment: "node" as const,
};
