-- 2026-07-11 audit follow-up: irreversible profile erasure.
--
-- Profile tombstones used to retain a complete personal profile plus enough
-- linked-row snapshots to restore it. Account deletion is now an erasure
-- boundary: profile tombstones retain structural deletion metadata only and
-- can never recreate a profile. Non-profile tombstones remain reversible.
--
-- Supabase Auth deletion happens after the transactional database purge. A
-- service-only job keeps the one Auth UUID needed to resume a partial failure;
-- the completion recorder clears that UUID in the same transaction as its
-- audit event. No authenticated role can read or mutate the job table.

set check_function_bodies = off;

alter table public.tombstones
  add column if not exists restorable boolean not null default true;

comment on column public.tombstones.restorable is
  'False for irreversible profile erasures. Non-profile tombstones retain the existing restore behavior.';

create table public.profile_auth_purge_jobs (
  tombstone_id uuid primary key
    references public.tombstones(id) on delete restrict,
  profile_id uuid not null,
  auth_user_id uuid,
  outcome text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint profile_auth_purge_jobs_outcome_valid
    check (
      outcome is null
      or outcome in ('deleted', 'already_missing', 'not_linked')
    ),
  constraint profile_auth_purge_jobs_completion_shape
    check (
      (completed_at is null and outcome is null)
      or
      (
        completed_at is not null
        and outcome is not null
        and auth_user_id is null
      )
    )
);

create index profile_auth_purge_jobs_pending_idx
  on public.profile_auth_purge_jobs (created_at)
  where completed_at is null;

alter table public.profile_auth_purge_jobs enable row level security;

revoke all on public.profile_auth_purge_jobs from public;
revoke all on public.profile_auth_purge_jobs from anon;
revoke all on public.profile_auth_purge_jobs from authenticated;
grant select on public.profile_auth_purge_jobs to service_role;

comment on table public.profile_auth_purge_jobs is
  'Service-only retry seam for cross-system profile erasure. While pending it holds structural IDs plus the linked Auth UUID; successful completion atomically clears the Auth UUID and retains only outcome metadata. RLS has no user policy.';


-- Audit metadata can contain nested before/after objects. Erasure removes
-- direct personal-name/contact keys at every depth while retaining structural
-- identifiers, actions, counts, roles, states, and timestamps.
create or replace function public.scrub_profile_pii_jsonb(p_value jsonb)
returns jsonb
language plpgsql
immutable
strict
parallel safe
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_key text;
  v_normalized_key text;
  v_child jsonb;
  v_result jsonb;
begin
  v_kind := jsonb_typeof(p_value);

  if v_kind = 'object' then
    v_result := '{}'::jsonb;
    for v_key, v_child in
      select entry.key, entry.value
        from jsonb_each(p_value) as entry
    loop
      v_normalized_key := regexp_replace(lower(v_key), '[^a-z0-9]', '', 'g');
      if v_normalized_key ~
        '(fullname|firstname|lastname|displayname|name|emailaddress|email|phonenumber|phone|mobilenumber|mobilephone|mobile)$'
      then
        continue;
      end if;
      v_result := v_result || jsonb_build_object(
        v_key,
        public.scrub_profile_pii_jsonb(v_child)
      );
    end loop;
    return v_result;
  end if;

  if v_kind = 'array' then
    select coalesce(
             jsonb_agg(
               public.scrub_profile_pii_jsonb(element.value)
               order by element.ordinality
             ),
             '[]'::jsonb
           )
      into v_result
      from jsonb_array_elements(p_value)
        with ordinality as element(value, ordinality);
    return v_result;
  end if;

  return p_value;
end;
$$;

revoke all on function public.scrub_profile_pii_jsonb(jsonb) from public;
revoke all on function public.scrub_profile_pii_jsonb(jsonb) from anon;
revoke all on function public.scrub_profile_pii_jsonb(jsonb) from authenticated;

-- AFTER INSERT is intentional: the child job references the newly inserted
-- tombstone. Both the job capture and the tombstone scrub remain invisible
-- until the surrounding permanent-delete transaction commits.
create or replace function public.capture_irreversible_profile_tombstone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_user_id uuid;
begin
  if new.entity_type <> 'profile' then
    return new;
  end if;

  begin
    v_auth_user_id := nullif(new.row_snapshot->>'auth_user_id', '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'invalid_profile_auth_user_id';
  end;

  if new.restored_at is null then
    insert into public.profile_auth_purge_jobs
      (tombstone_id, profile_id, auth_user_id)
    values
      (new.id, new.entity_id, v_auth_user_id);
  end if;

  update public.tombstones
     set row_snapshot = jsonb_strip_nulls(
           jsonb_build_object(
             'record_type', 'profile',
             'role', new.row_snapshot->'role',
             'status', new.row_snapshot->'status',
             'created_at', new.row_snapshot->'created_at',
             'deletion_policy', 'irreversible'
           )
         ),
         set_null_dependents = '[]'::jsonb,
         cleanup_snapshot = '[]'::jsonb,
         restorable = false
   where id = new.id;

  return new;
end;
$$;

revoke all on function public.capture_irreversible_profile_tombstone() from public;
revoke all on function public.capture_irreversible_profile_tombstone() from anon;
revoke all on function public.capture_irreversible_profile_tombstone() from authenticated;

drop trigger if exists trg_capture_irreversible_profile_tombstone
  on public.tombstones;
create trigger trg_capture_irreversible_profile_tombstone
  after insert on public.tombstones
  for each row
  when (new.entity_type = 'profile')
  execute function public.capture_irreversible_profile_tombstone();

-- Backfill only legacy profile purges that have no completed Auth-side audit.
-- Completed legacy purges need no retry identifier and intentionally get no
-- purge-job row.
insert into public.profile_auth_purge_jobs
  (tombstone_id, profile_id, auth_user_id)
select
  t.id,
  t.entity_id,
  case
    when coalesce(t.row_snapshot->>'auth_user_id', '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (t.row_snapshot->>'auth_user_id')::uuid
    else null
  end
from public.tombstones t
where t.entity_type = 'profile'
  and t.restored_at is null
  and not exists (
    select 1
      from public.profiles p
     where p.id = t.entity_id
  )
  and not exists (
    select 1
      from public.audit_events ae
     where ae.action = 'super_admin.auth_user_delete'
       and ae.metadata->>'tombstone_id' = t.id::text
  )
  and not exists (
    select 1
      from public.audit_events_archive ae
     where ae.action = 'super_admin.auth_user_delete'
       and ae.metadata->>'tombstone_id' = t.id::text
  )
on conflict (tombstone_id) do nothing;


-- Backfill audit erasure while legacy tombstones still carry the descriptors
-- needed to identify current-table rows whose actor FK was already SET NULL.
-- Restored tombstones are deliberately excluded: those profiles were not
-- erased and their current/archive attribution must remain intact.
update public.audit_events ae
   set metadata = public.scrub_profile_pii_jsonb(ae.metadata),
       actor_name = case
         when ae.actor_profile_id = t.entity_id
              or (
                ae.actor_profile_id is null
                and (
                  (
                    coalesce(t.row_snapshot->>'email', '') <> ''
                    and lower(coalesce(ae.actor_email, '')) =
                        lower(t.row_snapshot->>'email')
                  )
                )
              )
         then null
         else ae.actor_name
       end,
       actor_email = case
         when ae.actor_profile_id = t.entity_id
              or (
                ae.actor_profile_id is null
                and (
                  (
                    coalesce(t.row_snapshot->>'email', '') <> ''
                    and lower(coalesce(ae.actor_email, '')) =
                        lower(t.row_snapshot->>'email')
                  )
                )
              )
         then null
         else ae.actor_email
       end
  from public.tombstones t
 where t.entity_type = 'profile'
   and t.restored_at is null
   and not exists (
     select 1
       from public.profiles p
      where p.id = t.entity_id
   )
   and (
     ae.actor_profile_id = t.entity_id
     or (
       ae.actor_profile_id is null
       and (
         (
           coalesce(t.row_snapshot->>'email', '') <> ''
           and lower(coalesce(ae.actor_email, '')) =
               lower(t.row_snapshot->>'email')
         )
       )
     )
     or (
       lower(ae.entity_type) in ('profile', 'profiles')
       and ae.entity_id = t.entity_id
     )
     or ae.metadata->>'profile_id' = t.entity_id::text
     or ae.metadata->>'target_profile_id' = t.entity_id::text
     or ae.metadata->>'person_id' = t.entity_id::text
   );

update public.audit_events_archive ae
   set metadata = public.scrub_profile_pii_jsonb(ae.metadata),
       actor_profile_id = case
         when ae.actor_profile_id = t.entity_id then null
         else ae.actor_profile_id
       end,
       actor_name = case
         when ae.actor_profile_id = t.entity_id
              or (
                ae.actor_profile_id is null
                and (
                  (
                    coalesce(t.row_snapshot->>'email', '') <> ''
                    and lower(coalesce(ae.actor_email, '')) =
                        lower(t.row_snapshot->>'email')
                  )
                )
              )
         then null
         else ae.actor_name
       end,
       actor_email = case
         when ae.actor_profile_id = t.entity_id
              or (
                ae.actor_profile_id is null
                and (
                  (
                    coalesce(t.row_snapshot->>'email', '') <> ''
                    and lower(coalesce(ae.actor_email, '')) =
                        lower(t.row_snapshot->>'email')
                  )
                )
              )
         then null
         else ae.actor_email
       end
  from public.tombstones t
 where t.entity_type = 'profile'
   and t.restored_at is null
   and not exists (
     select 1
       from public.profiles p
      where p.id = t.entity_id
   )
   and (
     ae.actor_profile_id = t.entity_id
     or (
       ae.actor_profile_id is null
       and (
         (
           coalesce(t.row_snapshot->>'email', '') <> ''
           and lower(coalesce(ae.actor_email, '')) =
               lower(t.row_snapshot->>'email')
         )
       )
     )
     or (
       lower(ae.entity_type) in ('profile', 'profiles')
       and ae.entity_id = t.entity_id
     )
     or ae.metadata->>'profile_id' = t.entity_id::text
     or ae.metadata->>'target_profile_id' = t.entity_id::text
     or ae.metadata->>'person_id' = t.entity_id::text
   );

-- Existing profile tombstones cross the same erasure boundary in-place.
update public.tombstones
   set row_snapshot = jsonb_strip_nulls(
         jsonb_build_object(
           'record_type', 'profile',
           'role', row_snapshot->'role',
           'status', row_snapshot->'status',
           'created_at', row_snapshot->'created_at',
           'deletion_policy', 'irreversible'
         )
       ),
       set_null_dependents = '[]'::jsonb,
       cleanup_snapshot = '[]'::jsonb,
       restorable = false
 where entity_type = 'profile';

-- Free-text deletion reasons do not outlive a completed erasure.
update public.account_deletion_requests
   set reason = null
 where status = 'completed'
   and reason is not null;

-- Exact legacy actor matches are scrubbed again defensively. Unlike the old
-- blanket actor_profile_id IS NULL update, this can only match an unrestored
-- profile tombstone's retained pre-redaction descriptor.
update public.audit_events
   set actor_name = null,
       actor_email = null
 where actor_profile_id is null
   and (actor_name is not null or actor_email is not null)
   and exists (
     select 1
       from public.tombstones t
      where t.entity_type = 'profile'
        and t.restored_at is null
        and not exists (
          select 1
            from public.profiles p
           where p.id = t.entity_id
        )
        and (
          (
            coalesce(t.row_snapshot->>'email', '') <> ''
            and lower(coalesce(audit_events.actor_email, '')) =
                lower(t.row_snapshot->>'email')
          )
        )
   );

update public.audit_events_archive ae
   set actor_profile_id = null,
       actor_name = null,
       actor_email = null
 where exists (
   select 1
     from public.tombstones t
    where t.entity_type = 'profile'
      and t.entity_id = ae.actor_profile_id
      and t.restored_at is null
      and not exists (
        select 1
          from public.profiles p
         where p.id = t.entity_id
      )
 );

-- Normalize legacy Auth-purge audit identity to the structural profile id.
update public.audit_events
   set entity_id = (metadata->>'profile_id')::uuid
 where action = 'super_admin.auth_user_delete'
   and coalesce(metadata->>'profile_id', '') ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

update public.audit_events_archive
   set entity_id = (metadata->>'profile_id')::uuid
 where action = 'super_admin.auth_user_delete'
   and coalesce(metadata->>'profile_id', '') ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Future profile deletes scrub FK-linked and legacy descriptor-matched actor
-- rows before the profile FK link nulls.
create or replace function public.scrub_deleted_profile_audit_attribution()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.audit_events
     set metadata = public.scrub_profile_pii_jsonb(metadata),
         actor_name = case
           when actor_profile_id = old.id
                or (
                  actor_profile_id is null
                  and (
                    (
                      coalesce(old.email, '') <> ''
                      and lower(coalesce(actor_email, '')) = lower(old.email)
                    )
                  )
                )
           then null
           else actor_name
         end,
         actor_email = case
           when actor_profile_id = old.id
                or (
                  actor_profile_id is null
                  and (
                    (
                      coalesce(old.email, '') <> ''
                      and lower(coalesce(actor_email, '')) = lower(old.email)
                    )
                  )
                )
           then null
           else actor_email
         end
   where actor_profile_id = old.id
      or (
        actor_profile_id is null
        and (
          (
            coalesce(old.email, '') <> ''
            and lower(coalesce(actor_email, '')) = lower(old.email)
          )
        )
      )
      or (
        lower(entity_type) in ('profile', 'profiles')
        and entity_id = old.id
      )
      or metadata->>'profile_id' = old.id::text
      or metadata->>'target_profile_id' = old.id::text
      or metadata->>'person_id' = old.id::text;

  update public.audit_events_archive
     set metadata = public.scrub_profile_pii_jsonb(metadata),
         actor_profile_id = case
           when actor_profile_id = old.id then null
           else actor_profile_id
         end,
         actor_name = case
           when actor_profile_id = old.id
                or (
                  actor_profile_id is null
                  and (
                    (
                      coalesce(old.email, '') <> ''
                      and lower(coalesce(actor_email, '')) = lower(old.email)
                    )
                  )
                )
           then null
           else actor_name
         end,
         actor_email = case
           when actor_profile_id = old.id
                or (
                  actor_profile_id is null
                  and (
                    (
                      coalesce(old.email, '') <> ''
                      and lower(coalesce(actor_email, '')) = lower(old.email)
                    )
                  )
                )
           then null
           else actor_email
         end
   where actor_profile_id = old.id
      or (
        actor_profile_id is null
        and (
          (
            coalesce(old.email, '') <> ''
            and lower(coalesce(actor_email, '')) = lower(old.email)
          )
        )
      )
      or (
        lower(entity_type) in ('profile', 'profiles')
        and entity_id = old.id
      )
      or metadata->>'profile_id' = old.id::text
      or metadata->>'target_profile_id' = old.id::text
      or metadata->>'person_id' = old.id::text;

  return old;
end;
$$;

revoke all on function public.scrub_deleted_profile_audit_attribution() from public;
revoke all on function public.scrub_deleted_profile_audit_attribution() from anon;
revoke all on function public.scrub_deleted_profile_audit_attribution() from authenticated;

drop trigger if exists trg_scrub_deleted_profile_audit_attribution
  on public.profiles;
create trigger trg_scrub_deleted_profile_audit_attribution
  before delete on public.profiles
  for each row
  execute function public.scrub_deleted_profile_audit_attribution();

-- Service-role-only completion envelope. A concurrent/repeated call locks the
-- job and returns the existing audit id. On first completion, the audit insert
-- and Auth UUID clearing are one transaction.
create or replace function public.service_record_profile_auth_purge(
  p_actor_profile_id uuid,
  p_profile_id uuid,
  p_auth_user_id uuid,
  p_tombstone_id uuid,
  p_outcome text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_audit_id uuid;
  v_job public.profile_auth_purge_jobs;
begin
  if p_actor_profile_id is null
     or p_profile_id is null
     or p_tombstone_id is null then
    raise exception 'invalid_input';
  end if;

  if p_outcome not in ('deleted', 'already_missing', 'not_linked') then
    raise exception 'invalid_input';
  end if;

  if not exists (
    select 1
      from public.profiles
     where id = p_actor_profile_id
       and role = 'super_admin'
       and status = 'active'
  ) then
    raise exception 'invalid_actor';
  end if;

  select *
    into v_job
    from public.profile_auth_purge_jobs
   where tombstone_id = p_tombstone_id
   for update;

  if v_job.tombstone_id is null
     or v_job.profile_id is distinct from p_profile_id then
    raise exception 'invalid_target';
  end if;

  if v_job.completed_at is not null then
    select ae.id
      into v_audit_id
      from public.audit_events ae
     where ae.action = 'super_admin.auth_user_delete'
       and ae.metadata->>'tombstone_id' = p_tombstone_id::text
     limit 1;

    if v_audit_id is null then
      raise exception 'invalid_completed_job';
    end if;
    return v_audit_id;
  end if;

  if v_job.auth_user_id is distinct from p_auth_user_id then
    raise exception 'invalid_target';
  end if;

  if (
    v_job.auth_user_id is null
    and p_outcome <> 'not_linked'
  ) or (
    v_job.auth_user_id is not null
    and p_outcome not in ('deleted', 'already_missing')
  ) then
    raise exception 'invalid_outcome';
  end if;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    p_actor_profile_id,
    'super_admin.auth_user_delete',
    'profile',
    p_profile_id,
    jsonb_build_object(
      'profile_id', p_profile_id,
      'tombstone_id', p_tombstone_id,
      'outcome', p_outcome
    )
  )
  returning id into v_audit_id;

  update public.profile_auth_purge_jobs
     set auth_user_id = null,
         outcome = p_outcome,
         completed_at = now()
   where tombstone_id = p_tombstone_id;

  return v_audit_id;
end;
$$;

revoke all on function public.service_record_profile_auth_purge(
  uuid, uuid, uuid, uuid, text
) from public;
revoke all on function public.service_record_profile_auth_purge(
  uuid, uuid, uuid, uuid, text
) from anon;
revoke all on function public.service_record_profile_auth_purge(
  uuid, uuid, uuid, uuid, text
) from authenticated;
grant execute on function public.service_record_profile_auth_purge(
  uuid, uuid, uuid, uuid, text
) to service_role;

comment on function public.service_record_profile_auth_purge(
  uuid, uuid, uuid, uuid, text
) is
  'Service-only idempotent completion envelope for cross-system profile erasure. Validates and locks the pending purge job, writes the structural audit event, and atomically clears the Auth UUID.';

-- Recreate the restore RPC with one new guard. The remaining behavior is the
-- existing non-profile restore path.
create or replace function public.super_admin_restore_tombstone(
  p_tombstone_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_tomb public.tombstones;
  v_exists int;
  v_dep jsonb;
  v_child text;
  v_col text;
  v_ids uuid[];
  v_updated bigint;
  v_relinked bigint := 0;
  v_skipped bigint := 0;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  select * into v_tomb
    from public.tombstones
   where id = p_tombstone_id
   for update;
  if v_tomb.id is null then
    raise exception 'missing_tombstone';
  end if;

  if v_tomb.entity_type = 'profile' or not v_tomb.restorable then
    raise exception 'irreversible_deletion';
  end if;

  execute format('select 1 from public.%I where id = $1', v_tomb.table_name)
    into v_exists
    using v_tomb.entity_id;
  if v_exists is not null then
    raise exception 'id_already_exists';
  end if;

  begin
    execute format(
      'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
      v_tomb.table_name, v_tomb.table_name
    )
    using v_tomb.row_snapshot;
  exception
    when unique_violation then
      raise exception 'id_already_exists';
    when foreign_key_violation then
      raise exception 'missing_parent';
  end;

  for v_dep in select * from jsonb_array_elements(v_tomb.set_null_dependents)
  loop
    v_child := v_dep->>'table';
    v_col := v_dep->>'column';
    select coalesce(
             array_agg((value #>> '{}')::uuid),
             '{}'::uuid[]
           )
      into v_ids
      from jsonb_array_elements(v_dep->'ids') as value;

    if array_length(v_ids, 1) is null then
      continue;
    end if;

    execute format(
      'update public.%I set %I = $1 where id = any($2)',
      v_child, v_col
    )
    using v_tomb.entity_id, v_ids;
    get diagnostics v_updated = row_count;

    v_relinked := v_relinked + v_updated;
    v_skipped := v_skipped + (array_length(v_ids, 1) - v_updated);
  end loop;

  update public.tombstones
     set restored_at = now(),
         restored_by = v_actor
   where id = v_tomb.id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'super_admin.restore_tombstone',
    v_tomb.table_name,
    v_tomb.entity_id,
    jsonb_build_object(
      'tombstone_id', v_tomb.id,
      'entity_type', v_tomb.entity_type,
      'relinked', v_relinked,
      'skipped', v_skipped
    )
  );

  return jsonb_build_object(
    'tombstone_id', v_tomb.id,
    'entity_type', v_tomb.entity_type,
    'entity_id', v_tomb.entity_id,
    'relinked', v_relinked,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.super_admin_restore_tombstone(uuid) from public;
revoke all on function public.super_admin_restore_tombstone(uuid) from anon;
revoke all on function public.super_admin_restore_tombstone(uuid) from authenticated;
grant execute on function public.super_admin_restore_tombstone(uuid) to authenticated;

comment on function public.super_admin_restore_tombstone(uuid) is
  'Restores only a restorable non-profile tombstone. Profile erasures always raise irreversible_deletion; other entity types preserve the existing audited restore behavior.';
