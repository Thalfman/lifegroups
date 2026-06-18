import { describe, expect, it } from "vitest";

import type { SourceFile } from "../source-globber";
import {
  effectiveFunctions,
  normalizeArgTypes,
  parseSqlFunctions,
  unpinnedSecurityDefiners,
} from "../sql-functions";

function sql(relPath: string, text: string): SourceFile {
  return { relPath, absPath: `/repo/${relPath}`, text };
}

describe("normalizeArgTypes", () => {
  it("drops parameter names, modes, and defaults; keeps types", () => {
    expect(
      normalizeArgTypes(
        "p_full_name text, p_priority int default 3, inout p_count integer"
      )
    ).toEqual(["text", "int", "integer"]);
  });

  it("splits on top-level commas only (nested type args stay intact)", () => {
    expect(normalizeArgTypes("p_amount numeric(10, 2), p_label text")).toEqual([
      "numeric(10, 2)",
      "text",
    ]);
  });

  it("returns an empty list for a no-arg function", () => {
    expect(normalizeArgTypes("")).toEqual([]);
  });
});

describe("parseSqlFunctions", () => {
  it("detects a SECURITY DEFINER function that pins search_path (plpgsql)", () => {
    const { creates } = parseSqlFunctions(
      sql(
        "m1.sql",
        `create or replace function public.admin_do(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1;
end;
$$;`
      )
    );
    expect(creates).toHaveLength(1);
    expect(creates[0].signature).toBe("public.admin_do(uuid)");
    expect(creates[0].isSecurityDefiner).toBe(true);
    expect(creates[0].pinsSearchPath).toBe(true);
    expect(creates[0].line).toBe(1);
  });

  it("flags a SECURITY DEFINER function with no search_path", () => {
    const flagged = unpinnedSecurityDefiners([
      sql(
        "m1.sql",
        `create function public.leaky()
returns int
language sql
security definer
as $$ select 1 $$;`
      ),
    ]);
    expect(flagged.map((f) => f.signature)).toEqual(["public.leaky()"]);
  });

  it("accepts search_path placed BEFORE security definer", () => {
    const flagged = unpinnedSecurityDefiners([
      sql(
        "m1.sql",
        `create function public.ok()
returns int
language sql
set search_path = public, pg_temp
security definer
as $$ select 1 $$;`
      ),
    ]);
    expect(flagged).toHaveLength(0);
  });

  it("does not flag a SECURITY INVOKER (default) function", () => {
    const flagged = unpinnedSecurityDefiners([
      sql(
        "m1.sql",
        `create function public.invoker()
returns int
language sql
as $$ select 1 $$;`
      ),
    ]);
    expect(flagged).toHaveLength(0);
  });

  it("ignores a body that merely MENTIONS security definer / search_path", () => {
    // The dangerous words live only inside the dollar-quoted body and a comment.
    const flagged = unpinnedSecurityDefiners([
      sql(
        "m1.sql",
        `-- this comment says security definer and set search_path
create function public.body_mentions()
returns text
language plpgsql
set search_path = public, pg_temp
security definer
as $$
begin
  return 'security definer set search_path = evil';
end;
$$;`
      ),
    ]);
    expect(flagged).toHaveLength(0);
  });

  it("ignores CREATE FUNCTION examples inside SQL comments", () => {
    const { creates } = parseSqlFunctions(
      sql(
        "m1.sql",
        `-- create function public.commented() returns int security definer as $$ ... $$;
select 1;`
      )
    );
    expect(creates).toHaveLength(0);
  });

  it("distinguishes overloaded signatures by argument types", () => {
    const { creates } = parseSqlFunctions(
      sql(
        "m1.sql",
        `create function public.f(p_a text)
returns void language sql security definer set search_path = public as $$ select $$;
create function public.f(p_a text, p_b int)
returns void language sql security definer as $$ select $$;`
      )
    );
    expect(creates.map((c) => c.signature)).toEqual([
      "public.f(text)",
      "public.f(text,int)",
    ]);
    // Only the unpinned overload (the two-arg one) is flagged.
    expect(creates[0].pinsSearchPath).toBe(true);
    expect(creates[1].pinsSearchPath).toBe(false);
  });
});

describe("effectiveFunctions (folding migration history)", () => {
  it("a later CREATE OR REPLACE that pins overrides an earlier unpinned one", () => {
    const earlier = sql(
      "20260101000000_a.sql",
      `create function public.f()
returns int language sql security definer
as $$ select 1 $$;`
    );
    const later = sql(
      "20260202000000_b.sql",
      `create or replace function public.f()
returns int language sql security definer set search_path = public, pg_temp
as $$ select 1 $$;`
    );
    expect(unpinnedSecurityDefiners([earlier, later])).toHaveLength(0);
  });

  it("a later ALTER FUNCTION … SET search_path pins an unpinned definer", () => {
    const create = sql(
      "20260101000000_a.sql",
      `create function public.f(p_id uuid)
returns int language sql security definer
as $$ select 1 $$;`
    );
    const alter = sql(
      "20260202000000_b.sql",
      `alter function public.f(uuid) set search_path = public, pg_temp;`
    );
    expect(unpinnedSecurityDefiners([create, alter])).toHaveLength(0);
  });

  it("respects textual order WITHIN a file: ALTER then unpinned re-CREATE is flagged", () => {
    // A single migration that pins via ALTER and then re-creates the function
    // without search_path ends unpinned in Postgres — the fold must not apply
    // the ALTER last just because alters are parsed after creates.
    const file = sql(
      "20260101000000_a.sql",
      `alter function public.f() set search_path = public, pg_temp;
create or replace function public.f()
returns int language sql security definer
as $$ select 1 $$;`
    );
    expect(unpinnedSecurityDefiners([file]).map((f) => f.signature)).toEqual([
      "public.f()",
    ]);
  });

  it("an ALTER without SET search_path does NOT pin", () => {
    const create = sql(
      "20260101000000_a.sql",
      `create function public.f()
returns int language sql security definer
as $$ select 1 $$;`
    );
    const alter = sql(
      "20260202000000_b.sql",
      `alter function public.f() owner to postgres;`
    );
    expect(
      unpinnedSecurityDefiners([create, alter]).map((f) => f.signature)
    ).toEqual(["public.f()"]);
  });
});
