import { describe, expect, it } from "vitest";

// The workflow helpers are runtime Node ESM scripts, kept as .mjs so GitHub
// Actions can execute them directly without a build step.
import {
  classifyRequiredChecks,
  collectSensitiveWarnings,
  hasManualSensitiveApproval,
  hasSensitiveWarnings,
  isCodexLogin,
  manualSensitiveApprovalPhrase,
} from "../ai-review-shared.mjs";

describe("AI review shared helpers", () => {
  it("detects sensitive workflow, database, dependency, env, and discussion changes", () => {
    const warnings = collectSensitiveWarnings(
      [
        { filename: ".github/workflows/ai-review-orchestrator.yml" },
        { filename: "supabase/migrations/20260522000000_sensitive.sql" },
        { filename: "package-lock.json" },
        { filename: ".env.production" },
      ],
      [{ body: "This touches RLS and SECURITY DEFINER behavior." }],
    );

    expect(hasSensitiveWarnings(warnings)).toBe(true);
    expect(warnings.workflow).toContain(".github/workflows/ai-review-orchestrator.yml");
    expect(warnings.db).toContain("supabase/migrations/20260522000000_sensitive.sql");
    expect(warnings.dependency).toContain("package-lock.json");
    expect(warnings.security).toContain(".env.production");
    expect(warnings.security).toContain("discussion term matched: \\bRLS\\b");
  });

  it("requires non-bot approval before a sensitive PR can resume readiness", () => {
    const headSha = "abc123";
    const phrase = manualSensitiveApprovalPhrase(headSha);

    expect(
      hasManualSensitiveApproval(
        [{ user: { login: "github-actions[bot]" }, body: phrase }],
        12,
        headSha,
      ),
    ).toBe(false);

    expect(
      hasManualSensitiveApproval(
        [{ user: { login: "Thalfman" }, body: phrase }],
        12,
        headSha,
      ),
    ).toBe(true);
  });

  it("checks only configured required check names", () => {
    const result = classifyRequiredChecks(
      [
        { name: "lint + typecheck + test", status: "completed", conclusion: "success" },
        { name: "readiness", status: "completed", conclusion: "failure" },
      ],
      "lint + typecheck + test",
    );

    expect(result.missing).toEqual([]);
    expect(result.blocking).toEqual([]);
  });

  it("reports missing and pending required checks", () => {
    const result = classifyRequiredChecks(
      [{ name: "lint + typecheck + test", status: "queued", conclusion: null }],
      "lint + typecheck + test, preview",
    );

    expect(result.missing).toEqual(["preview"]);
    expect(result.blocking.map((check) => check.name)).toEqual(["lint + typecheck + test"]);
  });

  it("does not treat Claude as Codex when using heuristic actor detection", () => {
    expect(isCodexLogin("claude-codex-helper[bot]")).toBe(false);
    expect(isCodexLogin("openai-codex[bot]")).toBe(true);
  });
});
