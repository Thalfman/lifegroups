---
project_name: 'lifegroups'
user_name: 'Root'
date: '2026-05-28'
sections_completed: ['technology_stack']
existing_patterns_found: 9
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- Next.js 15 (App Router) + React 19, TypeScript 5.7 (`strict: true`, `moduleResolution: bundler`, path alias `@/* -> ./*`).
- Tailwind CSS 3.4 + Radix Dialog + lucide-react. `clsx` + `tailwind-merge` via `lib/utils.ts`.
- Supabase: `@supabase/ssr` 0.10 + `@supabase/supabase-js` 2.106 (Auth + Postgres + RLS). Cookie-auth server client only.
- Upstash Redis + Ratelimit for `lib/security/rate-limit.ts`.
- Tooling: ESLint `next/core-web-vitals`, Vitest 2.1 (node env), `tsx` for scripts. Package manager: npm (`package-lock.json`).
- Scripts: `npm run dev | build | lint | typecheck | test | test:run`.

## Critical Implementation Rules

_Documented in the generation phase (step-02)._
