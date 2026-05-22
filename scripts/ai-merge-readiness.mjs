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
const unique = (arr) => [...new Set(arr)];

function collectSensitiveWarnings(files, comments) {
  const warnings = { security: [], workflow: [], db: [], dependency: [] };
  for (const f of files.map((x) => x.filename)) {
    if (f.startsWith('.github/workflows/')) warnings.workflow.push(f);
    if (f.startsWith('supabase/migrations/') || f.startsWith('supabase/functions/')) warnings.db.push(f);
    if (f === 'package-lock.json' || f === 'pnpm-lock.yaml') warnings.dependency.push(f);
    if (f.startsWith('middleware.') || f.startsWith('auth/') || f.startsWith('rls/')) warnings.security.push(f);
  }
  const terms = [/\bRLS\b/i, /SECURITY DEFINER/i, /audit_events/i, /admin_private_note/i, /role checks/i, /leader-facing read models/i];
  for (const c of comments) {
    for (const t of terms) {
      if (t.test(c.body || '')) warnings.security.push(`discussion term matched: ${t.source}`);
    }
  }
  for (const k of Object.keys(warnings)) warnings[k] = unique(warnings[k]);
  return warnings;
}

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
  const sensitiveWarnings = collectSensitiveWarnings(files, [...issueComments, ...reviewComments, ...reviews]);

  if (!prNow.mergeable || ['blocked', 'dirty', 'unstable', 'draft', 'unknown'].includes(prNow.mergeable_state)) blockers.push(`PR mergeable_state is unsafe (${prNow.mergeable_state}).`);
  const badChecks = checks.check_runs.filter((c) => c.status !== 'completed' || c.conclusion !== 'success');
  if (badChecks.length) blockers.push('Checks are failing or pending.');

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

  const hasMax = issueComments.some((c) => (c.body || '').includes(`ai-review-orchestrator:state:${pr.number}:${headSha}:max-cycles-reached`));
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
    await ensureLabel('ai/security-sensitive', '8B0000', 'Security-sensitive files or terms detected.');
    await ensureLabel('ai/workflow-sensitive', '5319E7', 'Workflow-sensitive files detected.');
    await ensureLabel('ai/db-sensitive', '1D76DB', 'Database-sensitive files detected.');
    await ensureLabel('ai/dependency-sensitive', 'FBCA04', 'Dependency lockfile changes detected.');
  }

  if (ready) {
    if (!existingReady && READY_NOTIFY_ENABLED && !DRY_RUN) {
      const warningLines = [];
      if (sensitiveWarnings.security.length) warningLines.push(`- Security-sensitive areas changed: ${sensitiveWarnings.security.join(', ')}`);
      if (sensitiveWarnings.db.length) warningLines.push(`- Database-sensitive areas changed: ${sensitiveWarnings.db.join(', ')}`);
      if (sensitiveWarnings.workflow.length) warningLines.push(`- Workflow-sensitive areas changed: ${sensitiveWarnings.workflow.join(', ')}`);
      if (sensitiveWarnings.dependency.length) warningLines.push(`- Dependency-sensitive areas changed: ${sensitiveWarnings.dependency.join(', ')}`);
      const warningSection = warningLines.length ? `\nWarnings:\n${warningLines.join('\n')}\n` : '';
      const body = `@${READY_NOTIFY_LOGIN} AI review complete. This PR appears ready to merge manually.\n${warningSection}\nCodex: complete\nGemini: complete\nClaude: ${triggerComments.length ? 'completed' : 'not needed'}\nChecks: passing\nActionable AI feedback: none remaining\n\nNext step: manually review the warnings, then click Merge if satisfied.\n\n${readyMarker}`;
      await gh(`/repos/${owner}/${repo}/issues/${pr.number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    }
    if (!DRY_RUN) {
      const labels = ['ai/ready-to-merge'];
      if (sensitiveWarnings.security.length) labels.push('ai/security-sensitive');
      if (sensitiveWarnings.workflow.length) labels.push('ai/workflow-sensitive');
      if (sensitiveWarnings.db.length) labels.push('ai/db-sensitive');
      if (sensitiveWarnings.dependency.length) labels.push('ai/dependency-sensitive');
      await gh(`/repos/${owner}/${repo}/issues/${pr.number}/labels`, { method: 'POST', body: JSON.stringify({ labels }) });
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
  }

  const staleSentinel = '<!-- ai-merge-readiness:stale -->';
  const stalePrefix = `~~STALE: new commit pushed; this readiness notification no longer applies.~~\n\n${staleSentinel}\n\n`;
  const readyMarkerRegex = new RegExp(`<!--\\s*ai-merge-readiness:${pr.number}:([0-9a-f]{7,40}):ready\\s*-->`);
  for (const c of issueComments) {
    const cBody = c.body || '';
    if (cBody.includes(staleSentinel)) continue;
    const m = cBody.match(readyMarkerRegex);
    if (!m || m[1] === headSha) continue;
    if (DRY_RUN) {
      console.log(`readiness DRY_RUN: would mark comment ${c.id} (ready marker SHA ${m[1]}) stale on PR #${pr.number}`);
      continue;
    }
    await gh(`/repos/${owner}/${repo}/issues/comments/${c.id}`, { method: 'PATCH', body: JSON.stringify({ body: stalePrefix + cBody }) });
  }

  if (!DRY_RUN) {
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
