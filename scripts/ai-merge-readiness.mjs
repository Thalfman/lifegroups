import {
  ACTIONABLE_RE,
  claudeCompletionMarker,
  classifyRequiredChecks,
  collectSensitiveWarnings,
  formatSensitiveWarnings,
  hasClaudeCompletion,
  hasManualSensitiveApproval,
  hasSensitiveWarnings,
  isCodexLogin,
  isGeminiLogin,
  manualReviewRequiredMarker,
  parseCsvSet,
} from './ai-review-shared.mjs';

const token = process.env.GITHUB_TOKEN;
const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
if (!token || !owner || !repo) throw new Error('Missing GITHUB_TOKEN or GITHUB_REPOSITORY');

const TARGET_PR = process.env.MERGE_READINESS_PR_NUMBER ? Number(process.env.MERGE_READINESS_PR_NUMBER) : null;
const DRY_RUN = (process.env.MERGE_READINESS_DRY_RUN || 'false') === 'true';
const READY_NOTIFY_ENABLED = (process.env.AI_REVIEW_READY_NOTIFY_ENABLED || 'true') !== 'false';
const READY_NOTIFY_LOGIN = process.env.READY_NOTIFY_LOGIN || 'Thalfman';
const CODEX_ACTOR_EXACT = process.env.CODEX_ACTOR_LOGIN || '';
const GEMINI_ACTOR = process.env.GEMINI_ACTOR_LOGIN || 'gemini-code-assist[bot]';
const ALLOWED = parseCsvSet(process.env.ALLOWED_PR_AUTHORS || '');
const REQUIRED_CHECKS = process.env.AI_REVIEW_REQUIRED_CHECKS || '';

const isCodex = (login = '') => isCodexLogin(login, CODEX_ACTOR_EXACT);
const isGemini = (login = '') => isGeminiLogin(login, GEMINI_ACTOR);

async function gh(path, init = {}) { const res = await fetch(`https://api.github.com${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}) } }); if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`); return res.status === 204 ? null : res.json(); }
async function listAll(path) { let page = 1; const out = []; while (true) { const batch = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`); if (!Array.isArray(batch) || batch.length === 0) break; out.push(...batch); page += 1; } return out; }
async function ensureIssueReaction(issueNumber, content) {
  const reactions = await listAll(`/repos/${owner}/${repo}/issues/${issueNumber}/reactions`);
  const exists = reactions.some((r) => r.user?.login === 'github-actions[bot]' && r.content === content);
  if (exists || DRY_RUN) return;
  await gh(`/repos/${owner}/${repo}/issues/${issueNumber}/reactions`, { method: 'POST', body: JSON.stringify({ content }) });
}

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
  const requiredChecks = classifyRequiredChecks(checks.check_runs, REQUIRED_CHECKS);
  if (requiredChecks.missing.length) blockers.push(`Required checks have not appeared yet: ${requiredChecks.missing.join(', ')}.`);
  if (requiredChecks.blocking.length) blockers.push(`Required checks are failing or pending: ${requiredChecks.blocking.map((c) => c.name).join(', ')}.`);

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

  const sensitiveApproval = hasManualSensitiveApproval(issueComments, pr.number, headSha);
  const hasManualRequired = issueComments.some((c) => (c.body || '').includes(manualReviewRequiredMarker(pr.number, headSha)));
  if (hasSensitiveWarnings(sensitiveWarnings) && !sensitiveApproval) {
    blockers.push(`Sensitive areas require manual approval before readiness:\n${formatSensitiveWarnings(sensitiveWarnings)}`);
  }
  if (hasManualRequired && !sensitiveApproval) blockers.push('Manual-review-required marker exists for current head SHA.');

  const hasMax = issueComments.some((c) => (c.body || '').includes(`ai-review-orchestrator:state:${pr.number}:${headSha}:max-cycles-reached`));
  if (hasMax) blockers.push('Max-cycles-reached marker exists for current head SHA.');

  const triggerComments = issueComments.filter((c) => (c.body || '').includes(`ai-review-orchestrator:claude-trigger:${pr.number}:${headSha}`));
  if (triggerComments.length) {
    const lastTrigger = triggerComments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const claudeCompleted = hasClaudeCompletion(issueComments, pr.number, headSha, new Date(lastTrigger.created_at));
    if (!claudeCompleted) blockers.push(`Claude trigger exists without a current-head completion marker (${claudeCompletionMarker(pr.number, headSha)}).`);
  }

  const unresolvedActionable = [...reviewComments, ...issueComments].filter((c) => {
    const login = c.user?.login || '';
    return (isCodex(login) || isGemini(login)) && new Date(c.created_at) >= headDate && ACTIONABLE_RE.test(c.body || '');
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
      const body = `@${READY_NOTIFY_LOGIN} ✅ AI review complete. This PR appears ready to merge manually.\n\nPR: #${pr.number}\nHead SHA: ${headSha}\nCodex: complete\nGemini: complete\nClaude: ${triggerComments.length ? 'completed' : 'not needed'}\nChecks: passing\nActionable AI feedback: none remaining\n${warningSection}\nNext step: manually review and click Merge.\n\n${readyMarker}`;
      await gh(`/repos/${owner}/${repo}/issues/${pr.number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    }
    if (!DRY_RUN) {
      const labels = ['ai/ready-to-merge'];
      if (sensitiveWarnings.security.length) labels.push('ai/security-sensitive');
      if (sensitiveWarnings.workflow.length) labels.push('ai/workflow-sensitive');
      if (sensitiveWarnings.db.length) labels.push('ai/db-sensitive');
      if (sensitiveWarnings.dependency.length) labels.push('ai/dependency-sensitive');
      await gh(`/repos/${owner}/${repo}/issues/${pr.number}/labels`, { method: 'POST', body: JSON.stringify({ labels }) });
      await ensureIssueReaction(pr.number, '+1');
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
