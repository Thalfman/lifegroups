// Test stub for Next.js's `server-only` marker package, which is not installed
// in this environment (Next provides it at build time). Importing it in a module
// under vitest would otherwise fail to resolve. The real package only throws if
// imported from a client bundle; in node tests there is nothing to enforce, so
// an empty module is the correct stand-in.
export {};
