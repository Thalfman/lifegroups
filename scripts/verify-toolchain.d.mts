// Type declarations for the plain-Node preflight (verify-toolchain.mjs) so the
// Vitest unit test can import its pure helpers under strict tsc.

export interface ToolSpec {
  label: string;
  bin: string;
  script: string;
}

export interface ToolchainResult {
  ok: boolean;
  missing: ToolSpec[];
  present: ToolSpec[];
}

export declare const REQUIRED_TOOLS: ToolSpec[];
export declare function shimExists(binDir: string, bin: string): boolean;
export declare function checkToolchain(args: {
  binDir: string;
  tools?: ToolSpec[];
}): ToolchainResult;
export declare function formatRemediation(missing: ToolSpec[]): string;
export declare function defaultBinDir(): string;
export declare function main(): void;
