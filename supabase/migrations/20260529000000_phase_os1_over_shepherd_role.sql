-- Phase OS.1: Over-Shepherd role tier — enum value only.
--
-- Introduces `over_shepherd` as a new login tier in the oversight ladder
-- (Super Admin ▸ Ministry Admin ▸ Over-Shepherd ▸ Shepherd) per
-- docs/adr/0002-oversight-ladder-and-leader-gating.md.
--
-- This migration is intentionally ISOLATED: it adds nothing but the enum
-- value. Postgres requires a new enum value to be committed before any other
-- statement can reference it, so the login-bridge / RLS slices that follow
-- (which compare against 'over_shepherd'::public.user_role) must land in
-- their own later migrations. No table, policy, grant, or function is
-- created or broadened here.
--
-- `over_shepherd` is its own role category: it is NOT admin and NOT leader.
-- Admit / read predicates added in later slices opt it in explicitly; no
-- existing admin/leader/staff_viewer predicate is widened.

alter type public.user_role add value if not exists 'over_shepherd';
