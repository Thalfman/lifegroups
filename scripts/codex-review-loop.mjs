#!/usr/bin/env node

const {
  GITHUB_TOKEN,
  GITHUB_REPOSITORY,
  GITHUB_RUN_ID = '',
  GITHUB_EVENT_NAME = 'local',
  CODEX_LOOP_PR_NUMBER = '',
  CODEX_LOOP_DRY_RUN = 'false',
  CODEX_ACTOR_LOGIN = '',
  READY_NOTIFY_LOGIN = 'Thalfman',
  CODEX_REVIEW_LOOP_ENABLED = 'true',
  CODEX_FIX_ENABLED = 'true',
  CODEX_READY_NOTIFY_ENABLED = 'true',
  CODEX_QUIET_WINDOW_MINUTES = '5',
  CODEX_MAX_FIX_CYCLES = '3',
  CODEX_MAX_FIX_CYCLES_PER_SHA = '1',
} = process.env;

if (!GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN is required.');
}

if (!GITHUB_REPOSITORY || !GITHUB_REPOSITORY.includes('/')) {
  throw new Error('GITHUB_REPOSITORY must be set to owner/repo.');
}

const [OWNER, REPO] = GITHUB_REPOSITORY.split('/');
const API_ROOT = 'https://api.github.com';
const DRY_RUN = CODEX_LOOP_DRY_RUN === 'true';
const LOOP_ENABLED = CODEX_REVIEW_LOOP_ENABLED !== 'false';
const FIX_ENABLED = CODEX_FIX_ENABLED !== 'false';
const READY_NOTIFY_ENABLED = CODEX_READY_NOTIFY_ENABLED !== 'false';
const CODEX_ACTOR = CODEX_ACTOR_LOGIN.trim();
const READY_LOGIN = (READY_NOTIFY_LOGIN || 'Thalfman').trim() || 'Thalfman';
const QUIET_WINDOW_MINUTES = parseInteger(CODEX_QUIET_WINDOW_MINUTES, 5, 0);
const MAX_FIX_CYCLES = parseInteger(CODEX_MAX_FIX_CYCLES, 3, 0);
const MAX_FIX_CYCLES_PER_SHA = parseInteger(CODEX_MAX_FIX_CYCLES_PER_SHA, 1, 0);
const WORKFLOW_ACTOR_LOGIN = 'github-actions[bot]';
const DEFAULT_CODEX_ACTOR_LOGINS = new Set([
  'chatgpt-codex-connector',
  'chatgpt-codex-connector[bot]',
  'codex',
  'codex[bot]',
]);
const PASSING_CHECK_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);

const LABELS = {
  ready: {
    name: 'ai/ready-to-merge',
    color: '0E8A16',
    description: 'Codex approved the latest head SHA and checks are passing.',
  },
  blocked: {
    name: 'ai/blocked',
    color: 'B60205',
    description: 'Codex review loop is waiting on review, fixes, checks, or manual action.',
  },
  security: {
    name: 'ai/security-sensitive',
    color: '8B0000',
    description: 'Security-sensitive paths or terms were detected.',
  },
  db: {
    name: 'ai/db-sensitive',
    color: '1D76DB',
    description: 'Database-sensitive paths were detected.',
  },
  workflow: {
    name: 'ai/workflow-sensitive',
    color: '5319E7',
    description: 'Workflow-sensitive paths were detected.',
  },
  dependency: {
    name: 'ai/dependency-sensitive',
    color: 'FBCA04',
    description: 'Dependency lockfile changes were detected.',
  },
};

const SENSITIVE_TERMS = [
  'rls',
  'security definer',
  'audit_events',
  'admin_private_note',
  'role checks',
  'leader-facing read models',
];

function parseInteger(value, fallback, min) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

function apiPath(path) {
  return `/repos/${OWNER}/${REPO}${path}`;
}

async function github(method, path, { body, allow404 = false } = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} failed with ${response.status}: ${text.slice(0, 600)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function mutate(method, path, body, description) {
  if (DRY_RUN) {
    console.log(`[dry-run] ${description}`);
    return null;
  }
  return github(method, path, { body });
}

async function paginate(path) {
  const items = [];
  let page = 1;
  for (;;) {
    const separator = path.includes('?') ? '&' : '?';
    const data = await github('GET', `${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(data)) {
      throw new Error(`Expected paginated array from ${path}.`);
    }
    items.push(...data);
    if (data.length < 100) return items;
    page += 1;
  }
}

function isCodexLogin(login = '') {
  if (!login) return false;
  if (CODEX_ACTOR) return login === CODEX_ACTOR;

  const normalized = login.toLowerCase();
  if (normalized.includes('claude')) return false;
  if (normalized.includes('gemini')) return false;
  if (normalized.includes('vercel')) return false;
  if (normalized.includes('supabase')) return false;
  if (normalized.includes('github-actions')) return false;

  return DEFAULT_CODEX_ACTOR_LOGINS.has(normalized);
}

function isWorkflowMarkerComment(comment) {
  return comment.user?.login === WORKFLOW_ACTOR_LOGIN;
}

function marker(kind, prNumber, headSha) {
  return `<!-- codex-review-loop:${kind}:${prNumber}:${headSha} -->`;
}

function hasMarker(comments, exactMarker) {
  return comments.some((comment) => (
    isWorkflowMarkerComment(comment)
    && (comment.body || '').includes(exactMarker)
  ));
}

function findMarkerComment(comments, exactMarker) {
  return comments.find((comment) => (
    isWorkflowMarkerComment(comment)
    && (comment.body || '').includes(exactMarker)
  ));
}

function dateAfter(value, date) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) && time > date.getTime();
}

function maxDate(values) {
  const times = values
    .map((value) => Date.parse(value || ''))
    .filter((time) => Number.isFinite(time));
  if (!times.length) return null;
  return new Date(Math.max(...times));
}

function reviewSubmittedAtMs(review) {
  const time = Date.parse(review.submitted_at || '');
  return Number.isFinite(time) ? time : 0;
}

function reviewIsSubmitted(review) {
  return review.state !== 'PENDING' && reviewSubmittedAtMs(review) > 0;
}

function sameRepository(pr) {
  return pr.head?.repo?.full_name === GITHUB_REPOSITORY && pr.base?.repo?.full_name === GITHUB_REPOSITORY;
}

function commentAppliesToHead(comment, headSha) {
  return comment.commit_id === headSha || comment.original_commit_id === headSha;
}

function reviewAppliesToHead(review, headSha, headDate) {
  if (review.commit_id) return review.commit_id === headSha;
  return dateAfter(review.submitted_at, headDate);
}

function currentHeadCodexReviewComments(reviewComments, headSha) {
  return reviewComments.filter((comment) => (
    isCodexLogin(comment.user?.login)
    && commentAppliesToHead(comment, headSha)
  ));
}

function currentHeadCodexReviews(reviews, headSha, headDate) {
  return reviews.filter((review) => (
    isCodexLogin(review.user?.login)
    && reviewIsSubmitted(review)
    && reviewAppliesToHead(review, headSha, headDate)
  ));
}

function latestReviewByCodexActor(reviews, headSha, headDate) {
  const latestByActor = new Map();

  for (const review of currentHeadCodexReviews(reviews, headSha, headDate)) {
    const login = review.user?.login;
    if (!login) continue;

    const reviewTime = reviewSubmittedAtMs(review);
    const existing = latestByActor.get(login);
    const existingTime = reviewSubmittedAtMs(existing || {});

    if (!existing || reviewTime >= existingTime) {
      latestByActor.set(login, review);
    }
  }

  return [...latestByActor.values()];
}

function currentHeadFindingReviews(reviews, headSha, headDate) {
  return latestReviewByCodexActor(reviews, headSha, headDate).filter((review) => (
    review.state === 'CHANGES_REQUESTED'
    && (review.body || '').trim().length > 0
  ));
}

function findCodexApprovalReaction(reactions, headDate) {
  return reactions
    .filter((reaction) => (
      reaction.content === '+1'
      && isCodexLogin(reaction.user?.login)
      && dateAfter(reaction.created_at, headDate)
    ))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;
}

function latestCodexActivity({ reviews, reviewComments, issueComments, reactions, headSha, headDate }) {
  const reviewDates = currentHeadCodexReviews(reviews, headSha, headDate).map((review) => review.submitted_at);
  const reviewCommentDates = currentHeadCodexReviewComments(reviewComments, headSha).map((comment) => comment.updated_at || comment.created_at);
  const issueCommentDates = issueComments
    .filter((comment) => isCodexLogin(comment.user?.login) && dateAfter(comment.created_at, headDate))
    .map((comment) => comment.updated_at || comment.created_at);
  const reactionDates = reactions
    .filter((reaction) => isCodexLogin(reaction.user?.login) && dateAfter(reaction.created_at, headDate))
    .map((reaction) => reaction.created_at);

  return maxDate([...reviewDates, ...reviewCommentDates, ...issueCommentDates, ...reactionDates]);
}

function reviewAlreadyHappened({ reviews, reviewComments, issueComments, approvalReaction, headSha, headDate }) {
  if (approvalReaction) return true;
  if (currentHeadCodexReviewComments(reviewComments, headSha).length > 0) return true;
  if (currentHeadCodexReviews(reviews, headSha, headDate).length > 0) return true;
  return issueComments.some((comment) => isCodexLogin(comment.user?.login) && dateAfter(comment.created_at, headDate));
}

function fixRequestCounts(issueComments, prNumber, headSha) {
  const allPrefix = `codex-review-loop:fix-request:${prNumber}:`;
  const currentMarker = marker('fix-request', prNumber, headSha);
  return {
    total: issueComments.filter((comment) => (
      isWorkflowMarkerComment(comment)
      && (comment.body || '').includes(allPrefix)
    )).length,
    currentHead: issueComments.filter((comment) => (
      isWorkflowMarkerComment(comment)
      && (comment.body || '').includes(currentMarker)
    )).length,
  };
}

function collectSensitiveWarnings(files, textItems) {
  const warnings = {
    security: new Set(),
    db: new Set(),
    workflow: new Set(),
    dependency: new Set(),
  };

  for (const file of files) {
    const filename = (file.filename || '').replaceAll('\\', '/');
    if (filename.startsWith('.github/workflows/')) warnings.workflow.add(filename);
    if (filename.startsWith('supabase/migrations/') || filename.startsWith('supabase/functions/')) warnings.db.add(filename);
    if (/^middleware\.[^/]+$/.test(filename)) warnings.security.add(filename);
    if (filename.startsWith('auth/') || filename.startsWith('rls/')) warnings.security.add(filename);
    if (filename === 'package-lock.json' || filename === 'pnpm-lock.yaml') warnings.dependency.add(filename);
  }

  const text = textItems
    .map((item) => item.body || '')
    .join('\n')
    .toLowerCase();

  for (const term of SENSITIVE_TERMS) {
    if (text.includes(term)) warnings.security.add(`review/comment text mentions "${term}"`);
  }

  return {
    security: [...warnings.security].sort(),
    db: [...warnings.db].sort(),
    workflow: [...warnings.workflow].sort(),
    dependency: [...warnings.dependency].sort(),
  };
}

function warningLabels(warnings) {
  const labels = [];
  if (warnings.security.length) labels.push(LABELS.security.name);
  if (warnings.db.length) labels.push(LABELS.db.name);
  if (warnings.workflow.length) labels.push(LABELS.workflow.name);
  if (warnings.dependency.length) labels.push(LABELS.dependency.name);
  return labels;
}

function warningLines(warnings) {
  const lines = [];
  if (warnings.security.length) lines.push(`- Security-sensitive areas changed: ${warnings.security.join(', ')}`);
  if (warnings.db.length) lines.push(`- Database-sensitive areas changed: ${warnings.db.join(', ')}`);
  if (warnings.workflow.length) lines.push(`- Workflow-sensitive areas changed: ${warnings.workflow.join(', ')}`);
  if (warnings.dependency.length) lines.push(`- Dependency-sensitive areas changed: ${warnings.dependency.join(', ')}`);
  return lines;
}

function formatBlockedBody(prNumber, headSha, reasons, warnings) {
  const warningSection = warningLines(warnings);
  return [
    `Codex review loop status for PR #${prNumber} at ${headSha}:`,
    ...reasons.map((reason) => `- ${reason}`),
    ...(warningSection.length ? ['', 'Warnings:', ...warningSection] : []),
    '',
    marker('blocked', prNumber, headSha),
  ].join('\n');
}

function formatReadyBody(prNumber, headSha, warnings) {
  const warningSection = warningLines(warnings);
  return [
    `@${READY_LOGIN} ✅ Codex approved the latest commit. This PR appears ready to merge manually.`,
    '',
    `PR: #${prNumber}`,
    `Head SHA: ${headSha}`,
    'Codex: approved via +1 reaction on the parent PR',
    'Checks: passing',
    'Open Codex threads: none',
    'Quiet window: passed',
    ...(warningSection.length ? ['', 'Warnings:', ...warningSection] : []),
    '',
    'Next step: manually review and click Merge.',
    '',
    marker('ready', prNumber, headSha),
  ].join('\n');
}

function formatFixRequestBody(prNumber, headSha) {
  return [
    '@codex fix the unresolved Codex review findings for the current head SHA.',
    '',
    'Scope:',
    '- Address only unresolved Codex review findings that apply to the current head SHA.',
    '- Do not broaden scope.',
    '- Do not refactor unrelated code.',
    '- Preserve existing architecture and security rules.',
    '- Run lint, typecheck, tests, and build if available.',
    '- Push the smallest safe fix commit to this PR branch.',
    '',
    `Current head SHA: ${headSha}`,
    '',
    marker('fix-request', prNumber, headSha),
  ].join('\n');
}

function checkRunIsRelevant(checkRun) {
  const detailsUrl = checkRun.details_url || checkRun.html_url || '';
  if (GITHUB_RUN_ID && detailsUrl.includes(`/actions/runs/${GITHUB_RUN_ID}`)) return false;

  const name = `${checkRun.name || ''} ${checkRun.check_suite?.workflow_run?.name || ''}`.toLowerCase();
  if (name.includes('codex review loop') || name.includes('codex-review-loop')) return false;

  return true;
}

function statusUpdatedAtMs(status) {
  const time = Date.parse(status.updated_at || status.created_at || '');
  return Number.isFinite(time) ? time : 0;
}

function statusIsNewer(status, existing) {
  const statusTime = statusUpdatedAtMs(status);
  const existingTime = statusUpdatedAtMs(existing);
  if (statusTime !== existingTime) return statusTime > existingTime;
  return Number(status.id || 0) > Number(existing.id || 0);
}

function latestStatusesByContext(statuses) {
  const latestByContext = new Map();

  for (const status of statuses) {
    const context = status.context || 'unknown';
    const existing = latestByContext.get(context);
    if (!existing || statusIsNewer(status, existing)) {
      latestByContext.set(context, status);
    }
  }

  return [...latestByContext.values()];
}

async function evaluateChecks(headSha) {
  const checkRunsResponse = await listCheckRuns(headSha);
  const statusResponse = await github('GET', apiPath(`/commits/${headSha}/status`));
  const checkRuns = checkRunsResponse.filter(checkRunIsRelevant);
  const statuses = latestStatusesByContext(statusResponse.statuses || []);
  const failures = [];

  for (const checkRun of checkRuns) {
    if (checkRun.status !== 'completed') {
      failures.push(`${checkRun.name}: ${checkRun.status}`);
      continue;
    }
    if (!PASSING_CHECK_CONCLUSIONS.has(checkRun.conclusion)) {
      failures.push(`${checkRun.name}: ${checkRun.conclusion || 'missing conclusion'}`);
    }
  }

  for (const status of statuses) {
    if (status.state !== 'success') {
      failures.push(`${status.context}: ${status.state}`);
    }
  }

  const total = checkRuns.length + statuses.length;
  if (total === 0) {
    return {
      passed: false,
      reason: 'No check runs or commit statuses exist yet for the current head SHA.',
      summary: 'none',
    };
  }

  if (failures.length) {
    return {
      passed: false,
      reason: `Checks/statuses are not passing: ${failures.join('; ')}.`,
      summary: `${total} check/status item(s), ${failures.length} not passing`,
    };
  }

  return {
    passed: true,
    reason: `${total} check/status item(s) passing.`,
    summary: `${total} passing`,
  };
}

async function listCheckRuns(headSha) {
  const checkRuns = [];
  let page = 1;
  for (;;) {
    const response = await github('GET', apiPath(`/commits/${headSha}/check-runs?per_page=100&page=${page}`));
    const pageRuns = response.check_runs || [];
    checkRuns.push(...pageRuns);
    if (pageRuns.length < 100) return checkRuns;
    page += 1;
  }
}

async function ensureLabel(labelName) {
  const label = Object.values(LABELS).find((candidate) => candidate.name === labelName);
  if (!label) return;

  try {
    const existing = await github('GET', apiPath(`/labels/${encodeURIComponent(label.name)}`), { allow404: true });
    if (existing) return;
    await mutate('POST', apiPath('/labels'), {
      name: label.name,
      color: label.color,
      description: label.description,
    }, `create label ${label.name}`);
  } catch (error) {
    console.warn(`Unable to ensure label ${label.name}: ${error.message}`);
  }
}

async function addLabels(prNumber, labels) {
  const uniqueLabels = [...new Set(labels)].filter(Boolean);
  if (!uniqueLabels.length) return;

  await Promise.all(uniqueLabels.map((label) => ensureLabel(label)));
  try {
    await mutate('POST', apiPath(`/issues/${prNumber}/labels`), { labels: uniqueLabels }, `add labels ${uniqueLabels.join(', ')} to PR #${prNumber}`);
  } catch (error) {
    console.warn(`Unable to add labels to PR #${prNumber}: ${error.message}`);
  }
}

async function removeLabel(prNumber, label) {
  try {
    if (DRY_RUN) {
      console.log(`[dry-run] remove label ${label} from PR #${prNumber}`);
      return;
    }
    await github('DELETE', apiPath(`/issues/${prNumber}/labels/${encodeURIComponent(label)}`), { allow404: true });
  } catch (error) {
    console.warn(`Unable to remove label ${label} from PR #${prNumber}: ${error.message}`);
  }
}

async function postIssueComment(prNumber, body) {
  return mutate('POST', apiPath(`/issues/${prNumber}/comments`), { body }, `post issue comment on PR #${prNumber}`);
}

async function updateIssueComment(commentId, body) {
  return mutate('PATCH', apiPath(`/issues/comments/${commentId}`), { body }, `update issue comment ${commentId}`);
}

async function upsertBlockedComment(issueComments, prNumber, headSha, reasons, warnings) {
  const body = formatBlockedBody(prNumber, headSha, reasons, warnings);
  const existing = findMarkerComment(issueComments, marker('blocked', prNumber, headSha));

  if (existing) {
    if ((existing.body || '') === body) return;
    await updateIssueComment(existing.id, body);
    return;
  }

  await postIssueComment(prNumber, body);
}

async function addReactionIfMissing(target, id, content, actorLogin = 'github-actions[bot]') {
  try {
    const pathByTarget = {
      issue: apiPath(`/issues/${id}/reactions`),
      issueComment: apiPath(`/issues/comments/${id}/reactions`),
      reviewComment: apiPath(`/pulls/comments/${id}/reactions`),
    };
    const path = pathByTarget[target];
    if (!path) throw new Error(`Unknown reaction target ${target}.`);

    const reactions = await paginate(path);
    const exists = reactions.some((reaction) => reaction.content === content && reaction.user?.login === actorLogin);
    if (exists) return;

    await mutate('POST', path, { content }, `add ${content} reaction to ${target} ${id}`);
  } catch (error) {
    console.warn(`Unable to add ${content} reaction to ${target} ${id}: ${error.message}`);
  }
}

async function updateVisualReactions({ reviewComments, currentFindings, fixRequested, maxReached, headSha }) {
  const currentFindingIds = new Set(currentFindings.reviewComments.map((comment) => comment.id));
  const codexComments = reviewComments.filter((comment) => isCodexLogin(comment.user?.login));

  for (const comment of codexComments) {
    if (currentFindingIds.has(comment.id)) {
      await addReactionIfMissing('reviewComment', comment.id, 'eyes');
      if (fixRequested) await addReactionIfMissing('reviewComment', comment.id, 'rocket');
      if (maxReached) await addReactionIfMissing('reviewComment', comment.id, 'confused');
    } else if (!commentAppliesToHead(comment, headSha)) {
      await addReactionIfMissing('reviewComment', comment.id, '+1');
    }
  }
}

async function getPull(prNumber) {
  return github('GET', apiPath(`/pulls/${prNumber}`));
}

async function loadHeadObservedDate(pr) {
  const headSha = pr.head.sha;

  try {
    const timelineEvents = await paginate(apiPath(`/issues/${pr.number}/timeline`));
    const headCommitEvent = timelineEvents
      .filter((event) => (
        event.event === 'committed'
        && event.sha === headSha
        && event.created_at
      ))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];

    if (headCommitEvent) return new Date(headCommitEvent.created_at);
  } catch (error) {
    console.warn(`Unable to load PR #${pr.number} timeline for head timestamp: ${error.message}`);
  }

  const fallback = pr.updated_at || pr.created_at;
  if (!fallback) {
    throw new Error(`Unable to determine GitHub-observed head timestamp for ${headSha}.`);
  }

  console.warn(`Using PR server timestamp fallback for PR #${pr.number} head ${headSha}: ${fallback}`);
  return new Date(fallback);
}

async function loadPullData(pr) {
  const headSha = pr.head.sha;
  const [
    files,
    issueComments,
    reviewComments,
    reviews,
    parentReactions,
    checks,
    headDate,
  ] = await Promise.all([
    paginate(apiPath(`/pulls/${pr.number}/files`)),
    paginate(apiPath(`/issues/${pr.number}/comments`)),
    paginate(apiPath(`/pulls/${pr.number}/comments`)),
    paginate(apiPath(`/pulls/${pr.number}/reviews`)),
    paginate(apiPath(`/issues/${pr.number}/reactions`)),
    evaluateChecks(headSha),
    loadHeadObservedDate(pr),
  ]);

  return {
    files,
    issueComments,
    reviewComments,
    reviews,
    parentReactions,
    checks,
    headDate,
  };
}

async function requestCodexReview(prNumber, headSha, issueComments) {
  const requestMarker = marker('review-request', prNumber, headSha);
  if (hasMarker(issueComments, requestMarker)) return false;

  await postIssueComment(prNumber, `@codex review\n\n${requestMarker}`);
  return true;
}

async function requestCodexFix(prNumber, headSha, issueComments) {
  const requestMarker = marker('fix-request', prNumber, headSha);
  if (hasMarker(issueComments, requestMarker)) return false;

  await postIssueComment(prNumber, formatFixRequestBody(prNumber, headSha));
  return true;
}

async function stopForMaxCycles(prNumber, headSha, issueComments) {
  const maxMarker = marker('max-cycles', prNumber, headSha);
  if (hasMarker(issueComments, maxMarker)) return;

  await postIssueComment(
    prNumber,
    [
      `Codex review loop stopped for PR #${prNumber}; max fix cycles reached.`,
      '',
      maxMarker,
    ].join('\n'),
  );
}

async function markBlocked(prNumber, headSha, issueComments, reasons, warnings) {
  await addLabels(prNumber, [LABELS.blocked.name, ...warningLabels(warnings)]);
  await removeLabel(prNumber, LABELS.ready.name);
  await upsertBlockedComment(issueComments, prNumber, headSha, reasons, warnings);
}

async function markReady(prNumber, headSha, issueComments, warnings) {
  await addLabels(prNumber, [LABELS.ready.name, ...warningLabels(warnings)]);
  await removeLabel(prNumber, LABELS.blocked.name);

  if (READY_NOTIFY_ENABLED && !hasMarker(issueComments, marker('ready', prNumber, headSha))) {
    await postIssueComment(prNumber, formatReadyBody(prNumber, headSha, warnings));
  }

  await addReactionIfMissing('issue', prNumber, '+1');
}

async function processPull(prSummary) {
  const pr = await getPull(prSummary.number);
  const prNumber = pr.number;
  const headSha = pr.head.sha;
  console.log(`PR #${prNumber}: evaluating head ${headSha}`);

  if (pr.state !== 'open') {
    console.log(`PR #${prNumber}: skipped because state is ${pr.state}`);
    return;
  }

  if (!sameRepository(pr)) {
    console.log(`PR #${prNumber}: skipped because head repo ${pr.head?.repo?.full_name || '(unknown)'} is not ${GITHUB_REPOSITORY}`);
    return;
  }

  const {
    files,
    issueComments,
    reviewComments,
    reviews,
    parentReactions,
    checks,
    headDate,
  } = await loadPullData(pr);

  const latestPr = await getPull(prNumber);
  if (latestPr.head.sha !== headSha) {
    console.log(`PR #${prNumber}: head changed from ${headSha} to ${latestPr.head.sha}; skipping stale evaluation`);
    return;
  }

  const warnings = collectSensitiveWarnings(files, [...issueComments, ...reviewComments, ...reviews]);

  if (!LOOP_ENABLED) {
    console.log(`PR #${prNumber}: CODEX_REVIEW_LOOP_ENABLED=false; no review, fix, or ready actions will be posted`);
    return;
  }

  const approvalReaction = findCodexApprovalReaction(parentReactions, headDate);
  const reviewed = reviewAlreadyHappened({
    reviews,
    reviewComments,
    issueComments,
    approvalReaction,
    headSha,
    headDate,
  });

  const findingReviewComments = currentHeadCodexReviewComments(reviewComments, headSha);
  const findingReviews = currentHeadFindingReviews(reviews, headSha, headDate);
  const currentFindings = {
    reviewComments: findingReviewComments,
    reviews: findingReviews,
    count: findingReviewComments.length + findingReviews.length,
  };

  const fixCounts = fixRequestCounts(issueComments, prNumber, headSha);
  const maxMarker = marker('max-cycles', prNumber, headSha);
  const maxAlreadyReached = hasMarker(issueComments, maxMarker);
  let fixRequested = hasMarker(issueComments, marker('fix-request', prNumber, headSha));
  let reachedMaxThisRun = false;
  const reasons = [];

  if (!reviewed) {
    const requestMarker = marker('review-request', prNumber, headSha);
    if (!hasMarker(issueComments, requestMarker)) {
      await requestCodexReview(prNumber, headSha, issueComments);
      reasons.push('Requested Codex review for the current head SHA.');
    } else {
      reasons.push('Waiting for Codex review for the current head SHA.');
    }
  }

  if (pr.draft) {
    reasons.push('PR is draft; fix requests and ready notification are skipped.');
  }

  if (currentFindings.count > 0) {
    reasons.push(`Unresolved current-head Codex finding(s): ${currentFindings.count}.`);

    if (!pr.draft && FIX_ENABLED) {
      const totalLimitReached = fixCounts.total >= MAX_FIX_CYCLES;
      const shaLimitReached = fixCounts.currentHead >= MAX_FIX_CYCLES_PER_SHA;

      if (!fixRequested && (totalLimitReached || shaLimitReached)) {
        await stopForMaxCycles(prNumber, headSha, issueComments);
        reachedMaxThisRun = true;
      } else if (!fixRequested) {
        await requestCodexFix(prNumber, headSha, issueComments);
        fixRequested = true;
        reasons.push('Requested Codex fix for unresolved current-head findings.');
      } else {
        reasons.push('Waiting for Codex fix commit for the current head SHA.');
      }
    } else if (!FIX_ENABLED) {
      reasons.push('CODEX_FIX_ENABLED=false; fix request skipped.');
    }
  }

  await updateVisualReactions({
    reviewComments,
    currentFindings,
    fixRequested,
    maxReached: reachedMaxThisRun || maxAlreadyReached,
    headSha,
  });

  if (!approvalReaction) {
    reasons.push('Waiting for Codex +1 reaction on the parent PR after the current head commit.');
  }

  if (!checks.passed) {
    reasons.push(checks.reason);
  }

  if (pr.mergeable !== true) {
    reasons.push(`PR is not currently mergeable (${pr.mergeable === null ? 'mergeable state pending' : `mergeable=${pr.mergeable}`}).`);
  }

  if (maxAlreadyReached || reachedMaxThisRun) {
    reasons.push('Max fix cycles reached for this head SHA.');
  }

  const latestActivity = latestCodexActivity({
    reviews,
    reviewComments,
    issueComments,
    reactions: parentReactions,
    headSha,
    headDate,
  });
  const quietUntil = latestActivity
    ? new Date(latestActivity.getTime() + QUIET_WINDOW_MINUTES * 60 * 1000)
    : null;
  const quietPassed = quietUntil ? Date.now() >= quietUntil.getTime() : false;

  if (approvalReaction && !quietPassed) {
    reasons.push(`Quiet window has not elapsed since latest Codex activity (${latestActivity.toISOString()}).`);
  }

  const ready = (
    pr.state === 'open'
    && !pr.draft
    && pr.mergeable === true
    && checks.passed
    && approvalReaction
    && currentFindings.count === 0
    && !maxAlreadyReached
    && !reachedMaxThisRun
    && quietPassed
  );

  if (ready) {
    const readyPr = await getPull(prNumber);
    if (readyPr.head.sha !== headSha) {
      console.log(`PR #${prNumber}: head changed from ${headSha} to ${readyPr.head.sha} before ready notification; skipping stale ready state`);
      return;
    }
    if (readyPr.state !== 'open' || readyPr.draft || readyPr.mergeable !== true) {
      console.log(`PR #${prNumber}: ready state changed before notification; state=${readyPr.state} draft=${readyPr.draft} mergeable=${readyPr.mergeable}`);
      return;
    }

    await markReady(prNumber, headSha, issueComments, warnings);
    console.log(`PR #${prNumber}: ready at ${headSha}; checks=${checks.summary}`);
    return;
  }

  if (!reasons.length) {
    reasons.push('Waiting for Codex review loop readiness conditions.');
  }

  await markBlocked(prNumber, headSha, issueComments, reasons, warnings);
  console.log(`PR #${prNumber}: blocked at ${headSha}: ${reasons.join(' | ')}`);
}

async function listTargetPulls() {
  const target = CODEX_LOOP_PR_NUMBER.trim();
  if (target) {
    const prNumber = Number.parseInt(target, 10);
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      throw new Error(`CODEX_LOOP_PR_NUMBER must be a positive integer; received "${target}".`);
    }
    return [await getPull(prNumber)];
  }

  return paginate(apiPath('/pulls?state=open'));
}

async function main() {
  console.log(`codex-review-loop start event=${GITHUB_EVENT_NAME} dry_run=${DRY_RUN} target=${CODEX_LOOP_PR_NUMBER || 'all-open'} repo=${GITHUB_REPOSITORY}`);
  const pulls = await listTargetPulls();
  console.log(`codex-review-loop scanning ${pulls.length} open PR(s)`);

  let failures = 0;
  for (const pr of pulls) {
    try {
      await processPull(pr);
    } catch (error) {
      failures += 1;
      console.error(`PR #${pr?.number || '(unknown)'} failed: ${error.stack || error.message}`);
    }
  }

  console.log(`codex-review-loop done failures=${failures}`);
  if (failures > 0) process.exitCode = 1;
}

await main();
