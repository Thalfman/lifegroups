const token = process.env.GITHUB_TOKEN;
const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const prNumber = Number(process.env.MERGE_GATE_PR_NUMBER || '0');
const dryRun = (process.env.MERGE_GATE_DRY_RUN ?? 'true').toLowerCase() !== 'false';

if (!token || !owner || !repo || !prNumber) throw new Error('Missing required env vars');

const sensitivePaths = ['.github/workflows/', '.env', 'supabase/migrations/', 'supabase/functions/', 'middleware.', 'auth/', 'rls/', 'package-lock.json', 'pnpm-lock.yaml'];
const actionableRegex = /\b(bug|issue|risk|security|failing|failure|fix|concern|vulnerability|regression|broken|should|recommend)\b/i;

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
  if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function listAll(path) {
  let page = 1; const out = [];
  while (true) {
    const batch = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!batch.length) break;
    out.push(...batch);
    page += 1;
  }
  return out;
}

(async () => {
  const blockers = [];
  const pr = await gh(`/repos/${owner}/${repo}/pulls/${prNumber}`);
  const startSha = pr.head.sha;

  if (pr.head?.repo?.fork) blockers.push('PR is from a fork.');

  const files = await listAll(`/repos/${owner}/${repo}/pulls/${prNumber}/files`);
  if (files.some((f) => sensitivePaths.some((p) => (p.endsWith('/') ? f.filename.startsWith(p) : f.filename === p || f.filename.startsWith(p))))) {
    blockers.push('Sensitive paths changed.');
  }

  const comments = await listAll(`/repos/${owner}/${repo}/issues/${prNumber}/comments`);
  if (!comments.some((c) => c.body?.includes(`ai-review-orchestrator:state:${prNumber}:${startSha}:`))) blockers.push('Missing current-head orchestrator state markers.');
  if (!comments.some((c) => c.body?.includes(`claude-trigger:${prNumber}:${startSha}`) || c.body?.includes(`dry-run:${prNumber}:${startSha}:`))) blockers.push('No Claude cycle marker for current head SHA.');

  const reviewComments = await listAll(`/repos/${owner}/${repo}/pulls/${prNumber}/comments`);
  const unresolvedActionable = reviewComments.filter((c) => c.commit_id === startSha && actionableRegex.test(c.body || ''));
  if (unresolvedActionable.length > 0) blockers.push(`Unresolved actionable review comments remain: ${unresolvedActionable.length}.`);

  const checks = await gh(`/repos/${owner}/${repo}/commits/${startSha}/check-runs`);
  const badChecks = checks.check_runs.filter((c) => c.status !== 'completed' || c.conclusion !== 'success');
  if (badChecks.length) blockers.push(`Required checks not all passing (${badChecks.length} failing/pending).`);

  const prAfter = await gh(`/repos/${owner}/${repo}/pulls/${prNumber}`);
  if (prAfter.head.sha !== startSha) blockers.push('PR head SHA changed during gate check.');

  const body = blockers.length
    ? `AI merge gate blockers for PR #${prNumber} at ${startSha}:\n- ${blockers.join('\n- ')}`
    : 'AI merge gate passed in dry-run. This PR appears eligible for merge.';

  await gh(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, { method: 'POST', body: JSON.stringify({ body }) });

  if (!dryRun && blockers.length === 0) {
    await gh(`/repos/${owner}/${repo}/pulls/${prNumber}/merge`, { method: 'PUT', body: JSON.stringify({ merge_method: 'squash', sha: startSha }) });
  }
})();
