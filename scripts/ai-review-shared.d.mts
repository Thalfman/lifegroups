export interface SensitiveWarnings {
  security: string[];
  workflow: string[];
  db: string[];
  dependency: string[];
}

export interface ReviewCommentLike {
  body?: string;
  created_at?: string;
  updated_at?: string;
  user?: {
    login?: string;
  };
}

export interface ChangedFileLike {
  filename?: string;
}

export interface CheckRunLike {
  name: string;
  status: string;
  conclusion: string | null;
}

export const ACTIONS_BOT: string;
export const ACTIONABLE_RE: RegExp;
export const INFORMATIONAL_RE: RegExp;
export const SENSITIVE_PATHS: string[];
export const SENSITIVE_TERM_PATTERNS: RegExp[];

export function parseCsvSet(raw?: string): Set<string>;
export function parseRequiredChecks(raw?: string): string[];
export function isCodexLogin(login?: string, exactLogin?: string): boolean;
export function isGeminiLogin(login?: string, geminiActor?: string): boolean;
export function commentTime(comment: ReviewCommentLike): Date;
export function isSensitivePath(filename?: string): boolean;
export function collectSensitiveWarnings(
  files?: Array<string | ChangedFileLike>,
  comments?: ReviewCommentLike[],
): SensitiveWarnings;
export function hasSensitiveWarnings(warnings: SensitiveWarnings): boolean;
export function formatSensitiveWarnings(warnings: SensitiveWarnings): string;
export function manualSensitiveApprovalPhrase(headSha: string): string;
export function manualSensitiveApprovalMarker(prNumber: number, headSha: string): string;
export function manualReviewRequiredMarker(prNumber: number, headSha: string): string;
export function hasManualSensitiveApproval(
  comments: ReviewCommentLike[],
  prNumber: number,
  headSha: string,
): boolean;
export function claudeCompletionMarker(prNumber: number, headSha: string): string;
export function hasClaudeCompletion(
  comments: ReviewCommentLike[],
  prNumber: number,
  headSha: string,
  sinceDate?: Date,
): boolean;
export function classifyRequiredChecks(
  checkRuns?: CheckRunLike[],
  rawRequiredChecks?: string,
): {
  required: string[];
  missing: string[];
  blocking: CheckRunLike[];
};
