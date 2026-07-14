export type ReactDomPatchVariant = "development" | "production";
export type ReactDomPatchState = "patched" | "already-patched";

export const SUPPORTED_NEXT_VERSION: string;
export const SUPPORTED_BUNDLED_REACT_DOM_VERSION: string;
export const PATCH_REMOVAL_NEXT_VERSION: string;
export const PATCH_FILES: ReadonlyArray<{
  readonly relativePath: string;
  readonly variant: ReactDomPatchVariant;
  readonly vulnerableHash: string;
  readonly patchedHash: string;
}>;

export function hashSource(source: string): string;
export function patchSource(
  source: string,
  variant: ReactDomPatchVariant
): { state: ReactDomPatchState; source: string };
export function patchGuardedFile(args: {
  filePath: string;
  variant: ReactDomPatchVariant;
  vulnerableHash: string;
  patchedHash: string;
}): ReactDomPatchState;
export function validateRuntime(args: {
  nextVersion: string;
  bundledReactDomVersion: string;
}): void;
export function patchVendoredReactDom(args: {
  repoRoot: string;
}): ReadonlyArray<{ filePath: string; state: ReactDomPatchState }>;
export function main(): void;
