# Life Group Operations Dashboard

Phase 0 bootstrap for a ministry-focused operations app built with Next.js, TypeScript, Tailwind CSS, and shadcn/ui-style components.

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env template:
   ```bash
   cp .env.example .env.local
   ```
3. Run dev server:
   ```bash
   npm run dev
   ```

## Scripts
- `npm run dev` - start local app
- `npm run lint` - lint project
- `npm run typecheck` - TypeScript checks
- `npm run build` - production build

## Vercel setup (future)
- Import repository in Vercel.
- Set environment variables from `.env.example`.
- Keep on Hobby plan for Phase 0/1.

## Supabase setup (future)
- Create a free Supabase project.
- Populate `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Save `SUPABASE_SERVICE_ROLE_KEY` in Vercel project env only.

## Phase status
This phase intentionally excludes authentication, schema, business logic, attendance workflows, and dashboards.
