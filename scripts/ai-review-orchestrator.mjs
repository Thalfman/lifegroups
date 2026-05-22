const token = process.env.GITHUB_TOKEN;
const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
if (!token || !owner || !repo) throw new Error('Missing GITHUB_TOKEN or GITHUB_REPOSITORY');

const EVENT_NAME = process.env.GITHUB_EVENT_NAME || '';
const IS_AUTOMATIC_EVENT = EVENT_NAME !== 'workflow_dispatch';
const AUTOMATION_ENABLED = (process.env.AI_REVIEW_AUTOMATION_ENABLED || 'true') !== 'false';
const REQUEST_REVIEWS_ENABLED = (process.env.AI_REVIEW_REQUEST_REVIEWS || 'true') !== 'false';
const DRY_RUN = IS_AUTOMATIC_EVENT ? !AUTOMATION_ENABLED : (process.env.ORCHESTRATOR_DRY_RUN || 'true') !== 'false';
const rawTargetPr = (process.env.ORCHESTRATOR_PR_NUMBER || '').trim();
const TARGET_PR = /^\d+$/.test(rawTargetPr) ? Number(rawTargetPr) : null;
const CODEX_ACTOR_EXACT = process.env.CODEX_ACTOR_LOGIN || '';
const GEMINI_ACTOR = process.env.GEMINI_ACTOR_LOGIN || 'gemini-code-assist[bot]';
const CLAUDE_TRIGGER = process.env.CLAUDE_TRIGGER || '@claude';
const ALLOWED = new Set((process.env.ALLOWED_PR_AUTHORS || '').split(',').map((s) => s.trim()).filter(Boolean));
const ACTIONS_BOT = 'github-actions[bot]';

const actionableRegex = /\b(bug|issue|risk|security|failing|failure|fix|concern|vulnerability|regression|broken)\b/i;
const informationalRegex = /\b(info|nit|style|optional|fyi|question)\b/i;
const sensitiveTermRegex = /admin_private_note|SECURITY DEFINER|audit_events|role checks|leader-facing read models|\bRLS\b/i;
const sensitivePaths = ['.github/workflows/', '.env', 'supabase/migrations/', 'supabase/functions/', 'middleware.', 'auth/', 'rls/', 'package-lock.json', 'pnpm-lock.yaml'];

const isCodex = (login = '') => {
  if (!login) return false;
  const l = login.toLowerCase();
  if (l.includes('claude')) return false;
  return CODEX_ACTOR_EXACT ? login === CODEX_ACTOR_EXACT : l.includes('codex');
};
const isGemini = (login = '') => {
  if (!login) return false;
  if (login === GEMINI_ACTOR) return true;
  return login.toLowerCase().startsWith('gemini-code-assist');
};
const isSensitivePath = (f) => sensitivePaths.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p || f.startsWith(p)));

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${path}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
async function listAll(path) { let page = 1; const out = []; while (true) { const batch = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`); if (!Array.isArray(batch) || batch.length === 0) break; out.push(...batch); page += 1; } return out; }
async function post(pr, body) { if (DRY_RUN) return; await gh(`/repos/${owner}/${repo}/issues/${pr}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); }
const hasMarker = (comments, marker) => comments.some((c) => (c.body || '').includes(marker));
async function addReviewCommentReactionIfMissing(commentId, content) {
  const reactions = await listAll(`/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions`);
  const already = reactions.some((r) => r.user?.login === ACTIONS_BOT && r.content === content);
  if (already || DRY_RUN) return;
  await gh(`/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions`, { method: 'POST', body: JSON.stringify({ content }) });
}

async function processPr(pr) {
  if (pr.head?.repo?.fork || pr.head?.repo?.full_name !== `${owner}/${repo}`) return;
  if (pr.draft) return;
  if (ALLOWED.size && !ALLOWED.has(pr.user.login)) return;

  const headSha = pr.head.sha;
  const [headCommit, issueComments, reviewComments, reviews, files, reactions] = await Promise.all([
    gh(`/repos/${owner}/${repo}/commits/${headSha}`),
    listAll(`/repos/${owner}/${repo}/issues/${pr.number}/comments`),
    listAll(`/repos/${owner}/${repo}/pulls/${pr.number}/comments`),
    listAll(`/repos/${owner}/${repo}/pulls/${pr.number}/reviews`),
    listAll(`/repos/${owner}/${repo}/pulls/${pr.number}/files`),
    listAll(`/repos/${owner}/${repo}/issues/${pr.number}/reactions`),
  ]);
  const headDate = new Date(headCommit.commit.committer.date);
  const sensitiveChanged = files.some((f) => isSensitivePath(f.filename));
  const sensitiveByTerm = [...issueComments, ...reviewComments, ...reviews].some((c) => sensitiveTermRegex.test(c.body || ''));

  const codexCompleted = issueComments.some((c) => isCodex(c.user?.login) && new Date(c.created_at) >= headDate)
    || reviewComments.some((c) => isCodex(c.user?.login) && (c.commit_id === headSha || new Date(c.created_at) >= headDate))
    || reviews.some((r) => isCodex(r.user?.login) && new Date(r.submitted_at || 0) >= headDate)
    || reactions.some((r) => isCodex(r.user?.login) && ['+1', 'hooray'].includes(r.content) && new Date(r.created_at) >= headDate);
  const geminiCompleted = issueComments.some((c) => isGemini(c.user?.login) && new Date(c.created_at) >= headDate)
    || reviewComments.some((c) => isGemini(c.user?.login) && (c.commit_id === headSha || new Date(c.created_at) >= headDate))
    || reviews.some((r) => isGemini(r.user?.login) && new Date(r.submitted_at || 0) >= headDate);

  const reviewReqMarker = `<!-- ai-review-orchestrator:review-request:${pr.number}:${headSha} -->`;
  if (AUTOMATION_ENABLED && REQUEST_REVIEWS_ENABLED) {
    const missingCodex = !codexCompleted;
    const missingGemini = !geminiCompleted;
    if ((missingCodex || missingGemini) && !hasMarker(issueComments, reviewReqMarker)) {
      const lines = [];
      if (missingCodex) lines.push('@codex review');
      if (missingGemini) lines.push('/gemini review');
      lines.push(reviewReqMarker);
      await post(pr.number, lines.join('\n'));
    }
  }

  const actionableReviewComments = reviewComments.filter((c) => {
    const login = c.user?.login || '';
    const isAi = isCodex(login) || isGemini(login);
    if (!isAi) return false;
    const lower = login.toLowerCase();
    if (lower.includes('claude') || lower.includes('vercel') || lower.includes('supabase')) return false;
    if (c.commit_id !== headSha && new Date(c.created_at) < headDate) return false;
    return !informationalRegex.test(c.body || '');
  });

  for (const c of actionableReviewComments) {
    await addReviewCommentReactionIfMissing(c.id, 'eyes');
  }

  if (!(codexCompleted && geminiCompleted)) return;

  const aiComments = [...reviewComments, ...issueComments].filter((c) => {
    const login = c.user?.login || '';
    return (isCodex(login) || isGemini(login)) && !login.toLowerCase().includes('claude') && new Date(c.created_at) >= headDate;
  });
  const actionable = aiComments.filter((c) => {
    if (reviewComments.find((rc) => rc.id === c.id)) return !informationalRegex.test(c.body || '');
    return actionableRegex.test(c.body || '');
  }).map((c) => `- ${c.user.login}: ${c.html_url}`);

  const noActionMarker = `<!-- ai-review-orchestrator:state:${pr.number}:${headSha}:ready-for-readiness-check -->`;
  if (actionable.length === 0) {
    const handledReviewComments = reviewComments.filter((c) => {
      const login = c.user?.login || '';
      if (!(isCodex(login) || isGemini(login))) return false;
      const lower = login.toLowerCase();
      if (lower.includes('claude') || lower.includes('vercel') || lower.includes('supabase')) return false;
      return c.commit_id !== headSha || informationalRegex.test(c.body || '') || new Date(c.created_at) < headDate;
    });
    for (const c of handledReviewComments) {
      await addReviewCommentReactionIfMissing(c.id, '+1');
    }
    if (!hasMarker(issueComments, noActionMarker)) {
      await post(pr.number, `AI review cycle complete for PR #${pr.number} at ${headSha}. No actionable Codex/Gemini feedback detected.\n<!-- ai-review-orchestrator:state:${pr.number}:${headSha}:codex-complete -->\n<!-- ai-review-orchestrator:state:${pr.number}:${headSha}:gemini-complete -->\n${noActionMarker}`);
    }
    return;
  }

  if (!AUTOMATION_ENABLED || pr.draft) return;

  const triggerMarker = `<!-- ai-review-orchestrator:claude-trigger:${pr.number}:${headSha} -->`;
  const existingTriggers = issueComments.filter((c) => (c.body || '').includes(`ai-review-orchestrator:claude-trigger:${pr.number}:${headSha}`));
  const totalTriggers = issueComments.filter((c) => (c.body || '').includes('ai-review-orchestrator:claude-trigger:')).length;
  if (existingTriggers.length >= 2 || totalTriggers >= 3) {
    const maxMarker = `<!-- ai-review-orchestrator:state:${pr.number}:${headSha}:max-cycles-reached -->`;
    if (!hasMarker(issueComments, maxMarker)) {
      await post(pr.number, `AI review autopilot stopped for PR #${pr.number}; max Claude cycles reached.\n${maxMarker}`);
    }
    return;
  }
  if (hasMarker(issueComments, triggerMarker)) return;

  for (const c of actionableReviewComments) {
    await addReviewCommentReactionIfMissing(c.id, 'rocket');
  }

  const body = `${CLAUDE_TRIGGER}\nPR: #${pr.number}\nHead SHA: ${headSha}\nCodex: complete\nGemini: complete\nActionable feedback links:\n${actionable.join('\n')}\n\nReview the current PR diff and the Codex/Gemini feedback listed below. Address only actionable feedback that is relevant to the current diff and current head SHA. Ignore stale, duplicate, vague, or incorrect suggestions. Do not broaden scope. Do not refactor unrelated code. Do not change auth, RLS, secrets, GitHub workflows, deployment configuration, environment handling, or Supabase migrations unless the reviewer feedback directly identifies a concrete bug and the fix is minimal. Run relevant checks. If no patch is needed, leave a PR comment explaining why.\n${triggerMarker}`;
  await post(pr.number, body);
}

(async () => {
  console.log(`orchestrator start event=${EVENT_NAME} dry_run=${DRY_RUN} target_pr=${TARGET_PR || 'all-open'}`);
  let prs;
  try {
    prs = TARGET_PR ? [await gh(`/repos/${owner}/${repo}/pulls/${TARGET_PR}`)] : await listAll(`/repos/${owner}/${repo}/pulls?state=open`);
  } catch (e) {
    console.error(`orchestrator failed to list PRs: ${e.message}`);
    process.exit(1);
  }
  console.log(`orchestrator scanning ${prs.length} PR(s)`);
  let failures = 0;
  for (const pr of prs) {
    try {
      await processPr(pr);
    } catch (e) {
      failures += 1;
      console.error(`orchestrator failed on PR #${pr?.number} (head ${pr?.head?.sha}): ${e.message}`);
    }
  }
  console.log(`orchestrator done failures=${failures}`);
})();
