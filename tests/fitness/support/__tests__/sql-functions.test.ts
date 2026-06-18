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

describe("parseSqlFunctions body + flags (issue #700)", () => {
  it("captures a dollar-quoted ($$) body", () => {
    const { creates } = parseSqlFunctions(
      sql(
        "m1.sql",
        `create function public.f()
returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into public.members (id) values (1);
end;
$$;`
      )
    );
    expect(creates[0].body).toContain("insert into public.members");
    expect(creates[0].body).not.toContain("begin\n$$"); // delimiters removed
  });

  it("captures a named-tag body and is not truncated by an inner $$", () => {
    const { creates } = parseSqlFunctions(
      sql(
        "m1.sql",
        `create function public.f()
returns void language plpgsql security definer set search_path = public
as $func$
begin
  perform 'a literal with $$ inside it';
  insert into public.groups (id) values (1);
end;
$func$;`
      )
    );
    expect(creates[0].body).toContain("insert into public.groups");
    expect(creates[0].body).toContain("$$ inside it");
  });

  it("captures a SQL-standard BEGIN ATOMIC body (no AS delimiter)", () => {
    const { creates } = parseSqlFunctions(
      sql(
        "m1.sql",
        `create function public.f() returns void language sql security definer set search_path = public
begin atomic
  insert into public.members (id) values (1);
end;`
      )
    );
    expect(creates[0].body).toContain("insert into public.members");
    expect(creates[0].isSecurityDefiner).toBe(true);
  });

  it("BEGIN ATOMIC body is not truncated by an inner CASE…END", () => {
    const { creates } = parseSqlFunctions(
      sql(
        "m1.sql",
        `create function public.f() returns int language sql
begin atomic
  select case when true then 1 else 0 end;
  insert into public.groups (id) values (1);
end;`
      )
    );
    expect(creates[0].body).toContain("insert into public.groups");
  });

  it("returns an empty body for the degenerate $$$$ case", () => {
    const { creates } = parseSqlFunctions(
      sql(
        "m1.sql",
        `create function public.f()
returns void language sql security definer set search_path = public
as $$$$;`
      )
    );
    expect(creates[0].body).toBe("");
  });

  it("captures the legacy AS '…' body form with '' escapes", () => {
    const { creates } = parseSqlFunctions(
      sql(
        "m1.sql",
        `create function public.f()
returns text language sql security definer set search_path = public
as 'select ''hi''';`
      )
    );
    expect(creates[0].body).toBe("select ''hi''");
  });

  it("sets returnsTrigger for trigger and event_trigger", () => {
    const { creates } = parseSqlFunctions(
      sql(
        "m1.sql",
        `create function public.t1() returns trigger language plpgsql security definer set search_path = public as $$ begin return new; end; $$;
create function public.t2() returns event_trigger language plpgsql security definer set search_path = public as $$ begin end; $$;
create function public.w() returns void language sql security definer set search_path = public as $$ select 1 $$;`
      )
    );
    expect(creates.map((c) => c.returnsTrigger)).toEqual([true, true, false]);
  });

  it("sets isReadOnlyVolatility for stable / immutable only", () => {
    const { creates } = parseSqlFunctions(
      sql(
        "m1.sql",
        `create function public.s() returns int language sql security definer stable set search_path = public as $$ select 1 $$;
create function public.i() returns int language sql security definer immutable set search_path = public as $$ select 1 $$;
create function public.v() returns int language sql security definer set search_path = public as $$ select 1 $$;`
      )
    );
    expect(creates.map((c) => c.isReadOnlyVolatility)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("detects attributes placed AFTER the body (security definer / search_path)", () => {
    const { creates } = parseSqlFunctions(
      sql(
        "m1.sql",
        `create function public.post_attrs(p_id uuid)
returns void
as $$
begin
  insert into public.members (id) values (p_id);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;`
      )
    );
    expect(creates[0].isSecurityDefiner).toBe(true);
    expect(creates[0].pinsSearchPath).toBe(true);
  });

  it("flags a post-body SECURITY DEFINER that does not pin search_path", () => {
    const flagged = unpinnedSecurityDefiners([
      sql(
        "m1.sql",
        `create function public.leaky()
returns int
as $$ select 1 $$ language sql security definer;`
      ),
    ]);
    expect(flagged.map((f) => f.signature)).toEqual(["public.leaky()"]);
  });

  it("folds the body of the LAST definition for a signature", () => {
    const earlier = sql(
      "20260101000000_a.sql",
      `create function public.f() returns void language plpgsql security definer set search_path = public
as $$ begin insert into public.members values (1); end; $$;`
    );
    const later = sql(
      "20260202000000_b.sql",
      `create or replace function public.f() returns void language plpgsql security definer set search_path = public
as $$ begin insert into public.groups values (1); end; $$;`
    );
    const [f] = effectiveFunctions([earlier, later]);
    expect(f.body).toContain("insert into public.groups");
    expect(f.body).not.toContain("insert into public.members");
  });
});

describe("parseSqlFunctions GRANT/REVOKE (issue #700)", () => {
  it("parses grant/revoke execute on function with role lists", () => {
    const { grants } = parseSqlFunctions(
      sql(
        "m1.sql",
        `grant execute on function public.admin_do(p_id uuid) to authenticated;
revoke all on function public.helper(jsonb) from public, anon, authenticated;`
      )
    );
    expect(grants).toHaveLength(2);
    expect(grants[0]).toMatchObject({
      signature: "public.admin_do(uuid)",
      action: "grant",
      roles: ["authenticated"],
    });
    expect(grants[1]).toMatchObject({
      signature: "public.helper(jsonb)",
      action: "revoke",
      roles: ["public", "anon", "authenticated"],
    });
  });

  it("handles a multi-line signature with nested type args", () => {
    const { grants } = parseSqlFunctions(
      sql(
        "m1.sql",
        `grant execute on function public.f(
  p_amount numeric(10, 2),
  p_label text
) to authenticated;`
      )
    );
    expect(grants[0].signature).toBe("public.f(numeric(10, 2),text)");
  });

  it("parses a schema-wide GRANT ON ALL FUNCTIONS", () => {
    const { grants } = parseSqlFunctions(
      sql(
        "m1.sql",
        `grant execute on all functions in schema public to authenticated, anon;`
      )
    );
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      signature: null,
      allInSchema: "public",
      action: "grant",
      roles: ["authenticated", "anon"],
    });
  });

  it("parses DROP FUNCTION (with and without IF EXISTS)", () => {
    const { drops } = parseSqlFunctions(
      sql(
        "m1.sql",
        `drop function if exists public.f(jsonb);
drop function public.g(uuid, text);`
      )
    );
    expect(drops.map((d) => d.signature)).toEqual([
      "public.f(jsonb)",
      "public.g(uuid,text)",
    ]);
  });

  it("accepts the ROUTINE spelling for grants and drops", () => {
    const { grants, drops } = parseSqlFunctions(
      sql(
        "m1.sql",
        `grant execute on routine public.f(jsonb) to authenticated;
grant execute on all routines in schema public to authenticated;
drop routine if exists public.f(jsonb);`
      )
    );
    expect(grants[0]).toMatchObject({
      signature: "public.f(jsonb)",
      action: "grant",
      roles: ["authenticated"],
    });
    expect(grants[1]).toMatchObject({
      allInSchema: "public",
      action: "grant",
      roles: ["authenticated"],
    });
    expect(drops.map((d) => d.signature)).toEqual(["public.f(jsonb)"]);
  });
});

describe("effectiveFunctions appExecutable (Postgres EXECUTE-to-PUBLIC default)", () => {
  function appExec(text: string, signature: string): boolean {
    const fns = effectiveFunctions([sql("20260101000000_m.sql", text)]);
    const f = fns.find((x) => x.signature === signature);
    if (!f) throw new Error(`no function ${signature}`);
    return f.appExecutable;
  }

  it("is true by default when no grant/revoke is present", () => {
    expect(
      appExec(
        `create function public.f() returns int language sql security definer
set search_path = public as $$ select 1 $$;`,
        "public.f()"
      )
    ).toBe(true);
  });

  it("stays true after an explicit grant to authenticated", () => {
    expect(
      appExec(
        `create function public.f() returns void language sql security definer
set search_path = public as $$ select 1 $$;
grant execute on function public.f() to authenticated;`,
        "public.f()"
      )
    ).toBe(true);
  });

  it("is false once the PUBLIC default is revoked and no app role is granted", () => {
    expect(
      appExec(
        `create function public.f(p jsonb) returns void language sql security definer
set search_path = public as $$ select 1 $$;
revoke all on function public.f(jsonb) from public;
revoke all on function public.f(jsonb) from anon;
revoke all on function public.f(jsonb) from authenticated;`,
        "public.f(jsonb)"
      )
    ).toBe(false);
  });

  it("is true when granted to authenticated even after the PUBLIC revoke", () => {
    expect(
      appExec(
        `create function public.f() returns void language sql security definer
set search_path = public as $$ select 1 $$;
revoke all on function public.f() from public;
grant execute on function public.f() to authenticated;`,
        "public.f()"
      )
    ).toBe(true);
  });

  it("is false when granted only to service_role (not an app login)", () => {
    expect(
      appExec(
        `create function public.f() returns void language sql security definer
set search_path = public as $$ select 1 $$;
revoke all on function public.f() from public;
grant execute on function public.f() to service_role;`,
        "public.f()"
      )
    ).toBe(false);
  });

  it("respects grant/revoke order (a later revoke wins)", () => {
    expect(
      appExec(
        `create function public.f() returns void language sql security definer
set search_path = public as $$ select 1 $$;
revoke all on function public.f() from public;
grant execute on function public.f() to authenticated;
revoke execute on function public.f() from authenticated;`,
        "public.f()"
      )
    ).toBe(false);
  });

  it("ignores a trailing WITH GRANT OPTION when reading the role", () => {
    // The role token must be `authenticated`, not `authenticated with grant option`.
    expect(
      appExec(
        `create function public.f() returns void language sql security definer
set search_path = public as $$ select 1 $$;
revoke all on function public.f() from public;
grant execute on function public.f() to authenticated with grant option;`,
        "public.f()"
      )
    ).toBe(true);
  });

  it('reads a quoted role name ("authenticated")', () => {
    expect(
      appExec(
        `create function public.f() returns void language sql security definer
set search_path = public as $$ select 1 $$;
revoke all on function public.f() from public;
grant execute on function public.f() to "authenticated";`,
        "public.f()"
      )
    ).toBe(true);
  });

  it("DROP FUNCTION resets the revoke; a recreate is app-callable again", () => {
    // A revoked helper that is later dropped and recreated returns to the default
    // PUBLIC EXECUTE — the stale revoke must not keep appExecutable false.
    expect(
      appExec(
        `create function public.f(p jsonb) returns void language sql security definer
set search_path = public as $$ select 1 $$;
revoke all on function public.f(jsonb) from public;
drop function if exists public.f(jsonb);
create function public.f(p jsonb) returns void language sql security definer
set search_path = public as $$ select 1 $$;`,
        "public.f(jsonb)"
      )
    ).toBe(true);
  });

  it("re-applies a revoke that follows the drop/recreate", () => {
    expect(
      appExec(
        `create function public.f(p jsonb) returns void language sql security definer
set search_path = public as $$ select 1 $$;
revoke all on function public.f(jsonb) from public;
drop function if exists public.f(jsonb);
create function public.f(p jsonb) returns void language sql security definer
set search_path = public as $$ select 1 $$;
revoke all on function public.f(jsonb) from public;`,
        "public.f(jsonb)"
      )
    ).toBe(false);
  });

  it("models a schema-wide GRANT ON ALL FUNCTIONS re-exposing a revoked helper", () => {
    expect(
      appExec(
        `create function public.f(p jsonb) returns void language sql security definer
set search_path = public as $$ select 1 $$;
revoke all on function public.f(jsonb) from public;
revoke all on function public.f(jsonb) from authenticated;
grant execute on all functions in schema public to authenticated;`,
        "public.f(jsonb)"
      )
    ).toBe(true);
  });

  it("a schema-wide grant does not reach functions in another schema", () => {
    expect(
      appExec(
        `create function public.f() returns void language sql security definer
set search_path = public as $$ select 1 $$;
revoke all on function public.f() from public;
grant execute on all functions in schema other to authenticated;`,
        "public.f()"
      )
    ).toBe(false);
  });

  it("a schema-wide GRANT ON ALL ROUTINES re-exposes a revoked helper", () => {
    expect(
      appExec(
        `create function public.f(p jsonb) returns void language sql security definer
set search_path = public as $$ select 1 $$;
revoke all on function public.f(jsonb) from public;
revoke all on function public.f(jsonb) from authenticated;
grant execute on all routines in schema public to authenticated;`,
        "public.f(jsonb)"
      )
    ).toBe(true);
  });
});

describe("effectiveFunctions security-mode ALTER (issue #700)", () => {
  it("ALTER FUNCTION … SECURITY INVOKER downgrades an effective definer", () => {
    const create = sql(
      "20260101000000_a.sql",
      `create function public.f() returns void language sql security definer
set search_path = public as $$ insert into public.members values (1); $$;`
    );
    const alter = sql(
      "20260202000000_b.sql",
      `alter function public.f() security invoker;`
    );
    const [f] = effectiveFunctions([create, alter]);
    expect(f.isSecurityDefiner).toBe(false);
  });

  it("ALTER FUNCTION … SECURITY DEFINER upgrades an invoker function", () => {
    const create = sql(
      "20260101000000_a.sql",
      `create function public.f() returns void language sql
set search_path = public as $$ select 1 $$;`
    );
    const alter = sql(
      "20260202000000_b.sql",
      `alter function public.f() security definer;`
    );
    const [f] = effectiveFunctions([create, alter]);
    expect(f.isSecurityDefiner).toBe(true);
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
