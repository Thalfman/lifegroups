# Deployment (Phase 1)

## Vercel deployment notes
- Framework preset: **Next.js**.
- Root directory: repository root (`/`).
- This phase has **no required environment variables**.

## Commands
- Install command: `npm install`
- Build command: `npm run build`
- Output: default Next.js output

## Environment variables
### Required now
- None.

### Required in future Supabase phase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Troubleshooting common Vercel failures
1. **Missing scripts**: ensure `dev`, `build`, `start`, `lint`, and `typecheck` exist in `package.json`.
2. **Dependency install errors**: verify lockfile consistency and that all imports resolve to installed packages.
3. **Type/lint failures**: run `npm run lint` and `npm run typecheck` locally before deploy.
4. **Wrong root directory**: ensure Vercel project points at repo root where `package.json` and `app/` live.
5. **Env var assumptions**: Phase 1 should not read required env vars at build/runtime.
