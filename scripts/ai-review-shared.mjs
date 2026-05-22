export const ACTIONS_BOT = 'github-actions[bot]';

export const ACTIONABLE_RE = /\b(bug|issue|risk|security|failing|failure|fix|concern|vulnerability|regression|broken)\b/i;
export const INFORMATIONAL_RE = /\b(info|nit|style|optional|fyi|question)\b/i;

export const SENSITIVE_PATHS = [
  '.github/workflows/',
  '.env',
  'supabase/migrations/',
  'supabase/functions/',
  'middleware.',
  'auth/',
  'rls/',
  'package-lock.json',
  'pnpm-lock.yaml',
];

export const SENSITIVE_TERM_PATTERNS = [
  /\bRLS\b/i,
  /SECURITY DEFINER/i,
  /audit_events/i,
  /admin_private_note/i,
  /role checks/i,
  /leader-facing read models/i,
];

const DEFAULT_REQUIRED_CHECKS = ['lint + typecheck + test'];

export function parseCsvSet(raw = '') {
  return new Set(String(raw).split(',').map((s) => s.trim()).filter(Boolean));
}

export function parseRequiredChecks(raw = '') {
  const parsed = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  return parsed.length ? parsed : DEFAULT_REQUIRED_CHECKS;
}

export function isCodexLogin(login = '', exactLogin = '') {
  if (!login) return false;
  const lower = login.toLowerCase();
  if (lower.includes('claude')) return false;
  return exactLogin ? login === exactLogin : lower.includes('codex');
}

export function isGeminiLogin(login = '', geminiActor = 'gemini-code-assist[bot]') {
  if (!login) return false;
  if (login === geminiActor) return true;
  return login.toLowerCase().startsWith('gemini-code-assist');
}

export function commentTime(comment) {
  return new Date(comment.updated_at || comment.created_at);
}

export function isSensitivePath(filename = '') {
  return SENSITIVE_PATHS.some((path) => (
    path.endsWith('/') ? filename.startsWith(path) : filename === path || filename.startsWith(path)
  ));
}

export function collectSensitiveWarnings(files = [], comments = []) {
  const warnings = { security: [], workflow: [], db: [], dependency: [] };
  for (const file of files) {
    const filename = typeof file === 'string' ? file : file.filename;
    if (!filename) continue;
    if (filename.startsWith('.github/workflows/')) warnings.workflow.push(filename);
    if (filename.startsWith('supabase/migrations/') || filename.startsWith('supabase/functions/')) warnings.db.push(filename);
    if (filename === 'package-lock.json' || filename === 'pnpm-lock.yaml') warnings.dependency.push(filename);
    if (filename.startsWith('middleware.') || filename.startsWith('auth/') || filename.startsWith('rls/')) warnings.security.push(filename);
    if (filename === '.env' || filename.startsWith('.env')) warnings.security.push(filename);
  }

  for (const comment of comments) {
    for (const term of SENSITIVE_TERM_PATTERNS) {
      if (term.test(comment.body || '')) warnings.security.push(`discussion term matched: ${term.source}`);
    }
  }

  for (const key of Object.keys(warnings)) warnings[key] = [...new Set(warnings[key])];
  return warnings;
}

export function hasSensitiveWarnings(warnings) {
  return Object.values(warnings).some((items) => items.length > 0);
}

export function formatSensitiveWarnings(warnings) {
  const lines = [];
  if (warnings.security.length) lines.push(`- Security-sensitive areas: ${warnings.security.join(', ')}`);
  if (warnings.db.length) lines.push(`- Database-sensitive areas: ${warnings.db.join(', ')}`);
  if (warnings.workflow.length) lines.push(`- Workflow-sensitive areas: ${warnings.workflow.join(', ')}`);
  if (warnings.dependency.length) lines.push(`- Dependency-sensitive areas: ${warnings.dependency.join(', ')}`);
  return lines.join('\n');
}

export function manualSensitiveApprovalPhrase(headSha) {
  return `AI sensitive review approved for ${headSha}`;
}

export function manualSensitiveApprovalMarker(prNumber, headSha) {
  return `ai-review-orchestrator:manual-sensitive-approval:${prNumber}:${headSha}`;
}

export function manualReviewRequiredMarker(prNumber, headSha) {
  return `ai-review-orchestrator:state:${prNumber}:${headSha}:manual-review-required`;
}

export function hasManualSensitiveApproval(comments = [], prNumber, headSha) {
  const phrase = manualSensitiveApprovalPhrase(headSha);
  const marker = manualSensitiveApprovalMarker(prNumber, headSha);
  return comments.some((comment) => {
    const login = (comment.user?.login || '').toLowerCase();
    if (!login || login === ACTIONS_BOT || login.endsWith('[bot]')) return false;
    const body = comment.body || '';
    return body.includes(phrase) || body.includes(marker);
  });
}

export function claudeCompletionMarker(prNumber, headSha) {
  return `ai-review-orchestrator:claude-complete:${prNumber}:${headSha}`;
}

export function hasClaudeCompletion(comments = [], prNumber, headSha, sinceDate) {
  const marker = claudeCompletionMarker(prNumber, headSha);
  return comments.some((comment) => {
    const login = (comment.user?.login || '').toLowerCase();
    if (!login.includes('claude')) return false;
    if (sinceDate && new Date(comment.created_at) <= sinceDate) return false;
    return (comment.body || '').includes(marker);
  });
}

export function classifyRequiredChecks(checkRuns = [], rawRequiredChecks = '') {
  const required = parseRequiredChecks(rawRequiredChecks);
  const byName = new Map(checkRuns.map((check) => [check.name, check]));
  const missing = required.filter((name) => !byName.has(name));
  const blocking = required
    .map((name) => byName.get(name))
    .filter(Boolean)
    .filter((check) => check.status !== 'completed' || check.conclusion !== 'success');

  return { required, missing, blocking };
}
