const token = process.env.GITHUB_TOKEN;
const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');

if (!token || !owner || !repo) {
  throw new Error('Missing GITHUB_TOKEN or GITHUB_REPOSITORY');
}

const DRY_RUN = (process.env.ORCHESTRATOR_DRY_RUN ?? 'true').toLowerCase() !== 'false';
const TARGET_PR = process.env.ORCHESTRATOR_PR_NUMBER ? Number(process.env.ORCHESTRATOR_PR_NUMBER) : null;
const CODEX_ACTOR = process.env.CODEX_ACTOR_LOGIN || 'codex[bot]';
const GEMINI_ACTOR = process.env.GEMINI_ACTOR_LOGIN || 'gemini-code-assist[bot]';
const CLAUDE_TRIGGER = process.env.CLAUDE_TRIGGER || '@claude';
const ALLOWED = new Set((process.env.ALLOWED_PR_AUTHORS || '').split(',').map((s) => s.trim()).filter(Boolean));
const RUN_ID = process.env.GITHUB_RUN_ID || 'local';

const actionableRegex = /\b(bug|issue|risk|security|failing|failure|fix|concern|vulnerability|regression|broken|should|recommend)\b/i;
const sensitiveTermRegex = /admin_private_note|SECURITY DEFINER|audit_events|role checks|leader-facing read models|\bRLS\b/i;

const sensitivePaths = [
  '.github/workflows/', '.env', 'supabase/migrations/', 'supabase/functions/', 'middleware.', 'auth/', 'rls/', 'package-lock.json', 'pnpm-lock.yaml',
];

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${path}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const isSensitivePath = (f) => sensitivePaths.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p || f.startsWith(p)));

async function listAll(path) {
  let page = 1;
  const out = [];
  while (true) {
    const batch = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch);
    page += 1;
  }
  return out;
}

async function postComment(pr, body) {
  await gh(`/repos/${owner}/${repo}/issues/${pr}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
}

function hasMarker(comments, marker) {
  return comments.some((c) => c.body?.includes(marker));
}

async function processPr(pr) {
  if (pr.head?.repo?.fork) return;
  if (ALLOWED.size && !ALLOWED.has(pr.user.login)) return;

  const headSha = pr.head.sha;
  const headCommit = await gh(`/repos/${owner}/${repo}/commits/${headSha}`);
  const headDate = new Date(headCommit.commit.committer.date);

  const [issueComments, reviewComments, reviews, files] = await Promise.all([
    listAll(`/repos/${owner}/${repo}/issues/${pr.number}/comments`),
    listAll(`/repos/${owner}/${repo}/pulls/${pr.number}/comments`),
    listAll(`/repos/${owner}/${repo}/pulls/${pr.number}/reviews`),
    listAll(`/repos/${owner}/${repo}/pulls/${pr.number}/files`),
  ]);

  const sensitiveChanged = files.some((f) => isSensitivePath(f.filename));

  const codexThumb = issueComments.some((c) => c.user?.login === CODEX_ACTOR && /\+1|thumb/i.test(JSON.stringify(c.reactions || {})));
  const codexReview = reviews.some((r) => r.user?.login === CODEX_ACTOR && new Date(r.submitted_at || 0) >= headDate);
  const codexComplete = codexThumb || codexReview;

  const geminiIssue = issueComments.some((c) => c.user?.login === GEMINI_ACTOR && new Date(c.created_at) >= headDate);
  const geminiInline = reviewComments.some((c) => c.user?.login === GEMINI_ACTOR && (c.commit_id === headSha || new Date(c.created_at) >= headDate));
  const geminiComplete = geminiIssue || geminiInline;

  const actionable = reviewComments
    .filter((c) => new Date(c.created_at) >= headDate && actionableRegex.test(c.body || '') && [CODEX_ACTOR, GEMINI_ACTOR].includes(c.user?.login))
    .map((c) => `- ${c.user.login}: ${c.html_url}`);

  const issueActionable = issueComments
    .filter((c) => new Date(c.created_at) >= headDate && actionableRegex.test(c.body || '') && [CODEX_ACTOR, GEMINI_ACTOR].includes(c.user?.login))
    .map((c) => `- ${c.user.login}: ${c.html_url}`);

  const allActionable = [...actionable, ...issueActionable];
  const sensitiveByTerm = [...issueComments, ...reviewComments].some((c) => sensitiveTermRegex.test(c.body || ''));

  const triggerMarker = `<!-- ai-review-orchestrator:claude-trigger:${pr.number}:${headSha} -->`;
  if (hasMarker(issueComments, triggerMarker)) return;

  if (!(codexComplete && geminiComplete)) return;

  if (sensitiveChanged || sensitiveByTerm) {
    await postComment(pr.number, [
      `Manual review required for PR #${pr.number} at ${headSha} due to sensitive paths/terms.`,
      `<!-- ai-review-orchestrator:state:${pr.number}:${headSha}:manual-review-required -->`,
    ].join('\n'));
    return;
  }

  if (allActionable.length === 0) return;

  if (DRY_RUN) {
    await postComment(pr.number, [
      `Dry-run: would trigger Claude for PR #${pr.number} at head SHA ${headSha}.`,
      `Codex complete: ${codexComplete}. Gemini complete: ${geminiComplete}.`,
      ...allActionable,
      `<!-- ai-review-orchestrator:dry-run:${pr.number}:${headSha}:${RUN_ID} -->`,
    ].join('\n'));
    return;
  }

  const body = [
    `${CLAUDE_TRIGGER}`,
    `PR: #${pr.number}`,
    `Head SHA: ${headSha}`,
    `Codex status: complete=${codexComplete}`,
    `Gemini status: complete=${geminiComplete}`,
    'Actionable feedback links:',
    ...allActionable,
    '',
    'Review the current PR diff and the Codex/Gemini feedback listed below. Address only actionable feedback that is relevant to the current diff and current head SHA. Ignore stale, duplicate, vague, or incorrect suggestions. Do not broaden scope. Do not refactor unrelated code. Do not change auth, RLS, secrets, GitHub workflows, deployment configuration, environment handling, or Supabase migrations unless the reviewer feedback directly identifies a concrete bug and the fix is minimal. Run relevant checks. If no patch is needed, leave a PR comment explaining why.',
    triggerMarker,
    `<!-- ai-review-orchestrator:state:${pr.number}:${headSha}:claude-triggered -->`,
  ].join('\n');

  await postComment(pr.number, body);
}

(async () => {
  const prs = TARGET_PR
    ? [await gh(`/repos/${owner}/${repo}/pulls/${TARGET_PR}`)]
    : await listAll(`/repos/${owner}/${repo}/pulls?state=open`);
  for (const pr of prs) await processPr(pr);
})();
