// Hard-coded allow-list. Kept in sync with scripts/test-auth-shared.ts.
// Drift between this file and the script-side file would be a bug — both
// must list exactly the same five emails. The Over-Shepherd account exists so
// the Super-Admin test-accounts panel can manage/report it like the others;
// its coverage wiring (over_shepherds roster + assignment) is provisioned only
// by the local route-smoke seed (scripts/seed-test-auth-users.ts), not here.

export const KNOWN_TEST_EMAILS = [
  "test.admin@lifegroups.local",
  "test.overshepherd@lifegroups.local",
  "test.leader1@lifegroups.local",
  "test.leader2@lifegroups.local",
  "test.coleader@lifegroups.local",
] as const;

export type KnownTestEmail = (typeof KNOWN_TEST_EMAILS)[number];

export type TestUserSpec = {
  key: "admin" | "overshepherd" | "leader1" | "leader2" | "coleader";
  email: KnownTestEmail;
  passwordVar: string;
  fullName: string;
  role: "ministry_admin" | "over_shepherd" | "leader" | "co_leader";
  groupKey: "A" | "B" | null;
  groupRole: "leader" | "co_leader" | null;
};

export const TEST_USER_SPECS: TestUserSpec[] = [
  {
    key: "admin",
    email: "test.admin@lifegroups.local",
    passwordVar: "TEST_ADMIN_PASSWORD",
    fullName: "Test Ministry Admin",
    role: "ministry_admin",
    groupKey: null,
    groupRole: null,
  },
  {
    // Auth user + profile only here; the route-smoke seed adds the coverage
    // over leader1 that makes /over-shepherd render a real surface.
    key: "overshepherd",
    email: "test.overshepherd@lifegroups.local",
    passwordVar: "TEST_OVERSHEPHERD_PASSWORD",
    fullName: "Test Over-Shepherd",
    role: "over_shepherd",
    groupKey: null,
    groupRole: null,
  },
  {
    key: "leader1",
    email: "test.leader1@lifegroups.local",
    passwordVar: "TEST_LEADER1_PASSWORD",
    fullName: "Test Leader One",
    role: "leader",
    groupKey: "A",
    groupRole: "leader",
  },
  {
    key: "leader2",
    email: "test.leader2@lifegroups.local",
    passwordVar: "TEST_LEADER2_PASSWORD",
    fullName: "Test Leader Two",
    role: "leader",
    groupKey: "B",
    groupRole: "leader",
  },
  {
    key: "coleader",
    email: "test.coleader@lifegroups.local",
    passwordVar: "TEST_COLEADER_PASSWORD",
    fullName: "Test Co-Leader",
    role: "co_leader",
    groupKey: "A",
    groupRole: "co_leader",
  },
];

export const TEST_GROUP_SPECS = {
  A: {
    name: "TEST Life Group A",
    meeting_day: "Wednesday",
    meeting_time: "18:30",
    meeting_frequency: "weekly" as const,
    meeting_week_parity: null,
    lifecycle_status: "active" as const,
    health_status: "healthy" as const,
  },
  B: {
    name: "TEST Life Group B",
    meeting_day: "Thursday",
    meeting_time: "18:30",
    meeting_frequency: "weekly" as const,
    meeting_week_parity: null,
    lifecycle_status: "active" as const,
    health_status: "healthy" as const,
  },
};
