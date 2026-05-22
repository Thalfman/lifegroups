const token = process.env.GITHUB_TOKEN;
const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
if (!token || !owner || !repo) throw new Error('Missing GITHUB_TOKEN or GITHUB_REPOSITORY');

const TARGET_PR = process.env.MERGE_READINESS_PR_NUMBER ? Number(process.env.MERGE_READINESS_PR_NUMBER) : null;
const DRY_RUN = (process.env.MERGE_READINESS_DRY_RUN || 'false') === 'true';
const READY_NOTIFY_ENABLED = (process.env.AI_REVIEW_READY_NOTIFY_ENABLED || 'true') !== 'false';
const READY_NOTIFY_LOGIN = process.env.READY_NOTIFY_LOGIN || 'Thalfman';
const CODEX_ACTOR_EXACT = process.env.CODEX_ACTOR_LOGIN || '';
const GEMINI_ACTOR = process.env.GEMINI_ACTOR_LOGIN || 'gemini-code-assist[bot]';
const ALLOWED = new Set((process.env.ALLOWED_PR_AUTHORS || '').split(',').map((s) => s.trim()).filter(Boolean));
const sensitivePaths = ['.github/workflows/', '.env', 'supabase/migrations/', 'supabase/functions/', 'middleware.', 'auth/', 'rls/', 'package-lock.json', 'pnpm-lock.yaml'];
const actionableRegex = /\b(bug|issue|risk|security|failing|failure|fix|concern|vulnerability|regression|broken|should|recommend)\b/i;
const sensitiveTermRegex = /admin_private_note|SECURITY DEFINER|audit_events|role checks|leader-facing read models|\bRLS\b/i;

const isCodex = (login = '') => CODEX_ACTOR_EXACT ? login === CODEX_ACTOR_EXACT : login.toLowerCase().includes('codex');
const isGemini = (login = '') => {
  if (!login) return false;
  if (login === GEMINI_ACTOR) return true;
  return login.toLowerCase().startsWith('gemini-code-assist');
};
const isSensitivePath = (f) => sensitivePaths.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p || f.startsWith(p)));

async function gh(path, init = {}) { const res = await fetch(`https://api.github.com${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}) } }); if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`); return res.status === 204 ? null : res.json(); }
async function listAll(path) { let page = 1; const out = []; while (true) { const batch = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`); if (!Array.isArray(batch) || batch.length === 0) break; out.push(...batch); page += 1; } return out; }

async function ensureLabel(name, color, description) {
  try { await gh(`/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`); }
  catch { try { await gh(`/repos/${owner}/${repo}/labels`, { method: 'POST', body: JSON.stringify({ name, color, description }) }); } catch {} }
}

async function processPr(pr) {
  const blockers = [];
  if (pr.head?.repo?.fork || pr.head?.repo?.full_name !== `${owner}/${repo}`) blockers.push('PR is from a fork or different head repository.');
  if (ALLOWED.size && !ALLOWED.has(pr.user.login)) blockers.push('PR author is not in ALLOWED_PR_AUTHORS.');
  if (pr.draft) blockers.push('PR is draft.');

  const headSha = pr.head.sha;
  const [prNow, files, issueComments, reviewComments, reviews, checks, headCommit] = await Promise.all([
    gh(`/repos/${owner}/${repo}/pulls/${pr.number}`),
    listAll(`/repos/${owner}/${repo}/pulls/${pr.number}/files`),
    listAll(`/repos/${owner}/${repo}/issues/${pr.number}/comments`),
    listAll(`/repos/${owner}/${repo}/pulls/${pr.number}/comments`),
    listAll(`/repos/${owner}/${repo}/pulls/${pr.number}/reviews`),
    gh(`/repos/${owner}/${repo}/commits/${headSha}/check-runs`),
    gh(`/repos/${owner}/${repo}/commits/${headSha}`),
  ]);
  const headDate = new Date(headCommit.commit.committer.date);

  if (!prNow.mergeable || ['blocked', 'dirty', 'unstable', 'draft', 'unknown'].includes(prNow.mergeable_state)) blockers.push(`PR mergeable_state is unsafe (${prNow.mergeable_state}).`);
  const badChecks = checks.check_runs.filter((c) => c.status !== 'completed' || c.conclusion !== 'success');
  if (badChecks.length) blockers.push('Checks are failing or pending.');
  if (files.some((f) => isSensitivePath(f.filename))) blockers.push('Sensitive paths changed.');
  if ([...issueComments, ...reviewComments, ...reviews].some((c) => sensitiveTermRegex.test(c.body || ''))) blockers.push('Sensitive terms detected in AI discussion.');

  const codexComplete = issueComments.some((c) => isCodex(c.user?.login) && new Date(c.created_at) >= headDate)
    || reviewComments.some((c) => isCodex(c.user?.login) && (c.commit_id === headSha || new Date(c.created_at) >= headDate))
    || reviews.some((r) => isCodex(r.user?.login) && new Date(r.submitted_at || 0) >= headDate)
    || issueComments.some((c) => (c.body || '').includes(`ai-review-orchestrator:state:${pr.number}:${headSha}:codex-complete`));
  const geminiComplete = issueComments.some((c) => isGemini(c.user?.login) && new Date(c.created_at) >= headDate)
    || reviewComments.some((c) => isGemini(c.user?.login) && (c.commit_id === headSha || new Date(c.created_at) >= headDate))
    || reviews.some((r) => isGemini(r.user?.login) && new Date(r.submitted_at || 0) >= headDate)
    || issueComments.some((c) => (c.body || '').includes(`ai-review-orchestrator:state:${pr.number}:${headSha}:gemini-complete`));
  if (!codexComplete) blockers.push('No current-head Codex completion signal.');
  if (!geminiComplete) blockers.push('No current-head Gemini completion signal.');

  const hasManual = issueComments.some((c) => (c.body || '').includes(`ai-review-orchestrator:state:${pr.number}:${headSha}:manual-review-required`));
  const hasMax = issueComments.some((c) => (c.body || '').includes(`ai-review-orchestrator:state:${pr.number}:${headSha}:max-cycles-reached`));
  if (hasManual) blockers.push('Manual-review-required marker exists for current head SHA.');
  if (hasMax) blockers.push('Max-cycles-reached marker exists for current head SHA.');

  const triggerComments = issueComments.filter((c) => (c.body || '').includes(`ai-review-orchestrator:claude-trigger:${pr.number}:${headSha}`));
  if (triggerComments.length) {
    const lastTrigger = triggerComments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const claudeResponded = issueComments.some((c) => (c.user?.login || '').toLowerCase().includes('claude') && new Date(c.created_at) > new Date(lastTrigger.created_at));
    if (!claudeResponded) blockers.push('Claude trigger exists and Claude has not responded yet.');
  }

  const unresolvedActionable = [...reviewComments, ...issueComments].filter((c) => {
    const login = c.user?.login || '';
    return (isCodex(login) || isGemini(login)) && new Date(c.created_at) >= headDate && actionableRegex.test(c.body || '');
  });
  if (unresolvedActionable.length) blockers.push('Unresolved actionable Codex/Gemini feedback remains for current head SHA.');

  const hasReadyMarker = issueComments.some((c) => (c.body || '').includes(`ai-review-orchestrator:state:${pr.number}:${headSha}:ready-for-readiness-check`));
  if (!hasReadyMarker && unresolvedActionable.length) blockers.push('No ready-for-readiness-check marker and actionable feedback exists.');

  const latestPr = await gh(`/repos/${owner}/${repo}/pulls/${pr.number}`);
  if (latestPr.head.sha !== headSha) blockers.push('Current head SHA changed during readiness check.');

  const ready = blockers.length === 0;
  const readyMarker = `<!-- ai-merge-readiness:${pr.number}:${headSha}:ready -->`;
  const blockMarker = `<!-- ai-merge-readiness:${pr.number}:${headSha}:blocked -->`;
  const existingReady = issueComments.find((c) => (c.body || '').includes(readyMarker));
  const existingBlocked = issueComments.find((c) => (c.body || '').includes(blockMarker));

  if (!DRY_RUN) {
    await ensureLabel('ai/ready-to-merge', '0E8A16', 'AI readiness checks passed; merge manually.');
    await ensureLabel('ai/blocked', 'B60205', 'AI readiness checks found blockers.');
  }

  if (ready) {
    if (!existingReady && READY_NOTIFY_ENABLED && !DRY_RUN) {
      const body = `@${READY_NOTIFY_LOGIN} AI review complete. This PR appears ready to merge manually.\n\nPR: #${pr.number}\nHead SHA: ${headSha}\nCodex: complete\nGemini: complete\nClaude: ${triggerComments.length ? 'completed' : 'not needed'}\nChecks: passing\nActionable AI feedback: none remaining\n\nNext step: manually review and click Merge.\n\n${readyMarker}`;
      await gh(`/repos/${owner}/${repo}/issues/${pr.number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    }
    if (!DRY_RUN) {
      await gh(`/repos/${owner}/${repo}/issues/${pr.number}/labels`, { method: 'POST', body: JSON.stringify({ labels: ['ai/ready-to-merge'] }) });
      try { await gh(`/repos/${owner}/${repo}/issues/${pr.number}/labels/ai%2Fblocked`, { method: 'DELETE' }); } catch {}
    }
    return;
  }

  const body = `AI merge readiness blockers for PR #${pr.number} at ${headSha}:\n- ${blockers.join('\n- ')}\n${blockMarker}`;
  if (!DRY_RUN) {
    if (existingBlocked) {
      await gh(`/repos/${owner}/${repo}/issues/comments/${existingBlocked.id}`, { method: 'PATCH', body: JSON.stringify({ body }) });
    } else {
      await gh(`/repos/${owner}/${repo}/issues/${pr.number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    }
    await gh(`/repos/${owner}/${repo}/issues/${pr.number}/labels`, { method: 'POST', body: JSON.stringify({ labels: ['ai/blocked'] }) });
    try { await gh(`/repos/${owner}/${repo}/issues/${pr.number}/labels/ai%2Fready-to-merge`, { method: 'DELETE' }); } catch {}
  }
}

(async () => {
  console.log(`readiness start event=${process.env.GITHUB_EVENT_NAME || ''} dry_run=${DRY_RUN} target_pr=${TARGET_PR || 'all-open'}`);
  let prs;
  try {
    prs = TARGET_PR ? [await gh(`/repos/${owner}/${repo}/pulls/${TARGET_PR}`)] : await listAll(`/repos/${owner}/${repo}/pulls?state=open`);
  } catch (e) {
    console.error(`readiness failed to list PRs: ${e.message}`);
    process.exit(1);
  }
  console.log(`readiness scanning ${prs.length} PR(s)`);
  let failures = 0;
  for (const pr of prs) {
    try {
      await processPr(pr);
    } catch (e) {
      failures += 1;
      console.error(`readiness failed on PR #${pr?.number} (head ${pr?.head?.sha}): ${e.message}`);
    }
  }
  console.log(`readiness done failures=${failures}`);
})();
