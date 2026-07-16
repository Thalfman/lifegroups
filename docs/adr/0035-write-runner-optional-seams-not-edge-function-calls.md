# The Write Action Runner grows optional seams; Edge-Function actions stay outside

**Status:** Accepted — 2026-07-06. Extends
[ADR 0001](./0001-admin-write-action-runner.md) /
[ADR 0005](./0005-centralized-write-validation.md) (the Write Action Runner and
its shared core). Implements the safe slice of candidate 1 in the
2026-07-06 architecture deepening review (retired to git history).

Four write families re-spelled the runner's whole tested skeleton by hand —
untested — because small things wouldn't fit through its interface: a value
minted _before_ the RPC (the invite token whose hash is written but whose raw
form becomes the returned URL), an RPC error token that _means success_ (a
double submit hitting `name_not_pending` / `deletion_already_requested`), a
post-commit sign-out/redirect, and an Edge-Function call instead of an RPC.

## Decision

**The shared core (`lib/shared/run-action.ts`) grows only optional, data-shaped
seams:**

- **`context`** — an optional pre-RPC step that mints values reaching `rpc`
  and `result`. It runs after the Supabase-client check (so
  `supabase_not_configured` still wins) and may fail with its own error code
  (e.g. `origin_unresolved`).
- **`treatAsOk`** — a list of RPC error tokens that mean the write's job is
  already done. A match runs revalidate and finishes `ok` (with per-token log
  fields such as `error_code: "already_requested"`), returning the token's
  success value.
- **`authenticate` failure `code`** — a migrating action keeps its established
  denial code (`no_session`) instead of the generic `auth_denied`.
- **Navigation rethrow** — the exception net recognizes Next.js navigation
  throws by digest and rethrows them (finishing the log line first) instead of
  swallowing a `redirect()` as an `unhandled_exception`.

**`redirect()` and post-commit teardown live in action wrappers, never inside
runner seams.** Next's `redirect()` works by throwing; putting it inside a seam
fights the runner's "always returns `ActionResult`, never throws" contract.
The account action's ordering (RPC commit → revalidate → sign-out → cookie
clears → redirect) falls out naturally: the runner owns commit + revalidate +
log, the wrapper owns teardown + navigation. The rethrow branch above is
defense-in-depth, not an invitation.

**Self-service actions use the shared core directly — no fourth adapter.** The
welcome and account actions authenticate "any signed-in user" via one
`makeSelfServiceAuthenticate` helper (`lib/account/run-action-auth.ts`) and
import `runWriteAction` from `@/lib/shared/run-action`, which the
`actions-use-run-action` fitness check accepts verbatim. Two actions do not
justify a new adapter surface.

**A write may declare an empty revalidate set.** The revalidate-paths fitness
extractor recognizes the exact literal `() => []` and pins `[]` — an explicit
declaration, distinct from a helper that merely _resolves_ to nothing, which
still fails loudly.

## The boundary: what deliberately stays outside

- **Edge-Function invokers** (`invite-user`, `test-accounts`,
  `redeem-invite`). The approved service-role seam lives in the Edge Function,
  not the runner; their audit pairing happens inside the function body, which
  the static `write-rpc-audit-pairing` check (a migrations scanner) cannot
  see. A runner "call adapter" would make these writes _look_ statically
  guaranteed when they are not, and their structured multi-line error mapping
  (`lib/admin/edge-fn-error.ts`) is a different contract from the runner's
  token→message table. They remain documented exemptions.
- **`reset-password`.** It performs two sequential commits (the name RPC, then
  Supabase Auth `updateUser`) with independent error handling — deliberately
  ordered so a failed name write stays retryable. A single-RPC pipeline cannot
  express that honestly.

## Consequences

- invite-link, welcome, and account are declarative specs inheriting the
  runner's tested branches; the `actions-use-run-action` EXEMPT map shrinks
  from 11 to 8.
- All new core fields are optional: the leader adapter and its suite are
  untouched, and the admin adapter threads only `context` (mirroring how it
  omits `guardRaw`).
- Accepted log deltas on the migrated actions (user-facing copy unchanged):
  auth precedes validation; invite-link's `not_super_admin` / `rpc_failed`
  codes become `auth_denied` / `rpc_error`; account's `not_confirmed` folds
  into `validation_failed`; the `forbidden_target` denial logs as an
  `rpc_error` fail.
- The next dodger that needs a seam extends the core's interface (as here),
  not a fork of the skeleton — unless it is an Edge-Function commit or a
  multi-commit flow, which this ADR deliberately keeps out.
