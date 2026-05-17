"use server";

// Phase 5A.0 server action stubs. Contracts documented in docs/PHASE_5A_ACTION_CONTRACTS.md. Each function throws immediately; nothing touches Supabase until Phase 5A.1.

const NOT_ENABLED =
  "Phase 5A.1 required: write policies and server actions are not enabled yet.";

export async function adminCreateMinistryAdmin(_input: unknown): Promise<never> {
  throw new Error(NOT_ENABLED);
}

export async function adminCreateLeaderProfile(_input: unknown): Promise<never> {
  throw new Error(NOT_ENABLED);
}

export async function adminCreateMember(_input: unknown): Promise<never> {
  throw new Error(NOT_ENABLED);
}

export async function adminAssignLeaderToGroup(_input: unknown): Promise<never> {
  throw new Error(NOT_ENABLED);
}

export async function adminAssignMemberToGroup(_input: unknown): Promise<never> {
  throw new Error(NOT_ENABLED);
}

export async function adminDeactivateProfile(_input: unknown): Promise<never> {
  throw new Error(NOT_ENABLED);
}

export async function adminDeactivateMember(_input: unknown): Promise<never> {
  throw new Error(NOT_ENABLED);
}

export async function adminChangeUserRole(_input: unknown): Promise<never> {
  throw new Error(NOT_ENABLED);
}
