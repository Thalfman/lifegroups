create extension if not exists pgcrypto;

create type user_role as enum ('super_admin','ministry_admin','staff_viewer','leader','co_leader');
create type profile_status as enum ('active','inactive','invited');
create type group_lifecycle_status as enum ('active','planned_pause','seasonal_break','launching_soon','needs_leader','at_risk','closed');
create type group_health_status as enum ('healthy','watch','needs_follow_up','healthy_paused','restart_soon','overdue_restart','capacity_full','needs_leader_support');
create type membership_status as enum ('active','inactive','paused','transferred');
create type role_in_group as enum ('member','leader','co_leader');
create type attendance_status as enum ('present','absent','excused');
create type attendance_session_status as enum ('not_submitted','submitted','did_not_meet','planned_pause','admin_entered');
create type guest_pipeline_stage as enum ('new','contacted','interested','assigned','attended','placed','not_now');
create type follow_up_type as enum ('attendance','guest','leader','capacity','pause','care','admin');
create type follow_up_status as enum ('open','in_progress','done','snoozed');
create type follow_up_priority as enum ('low','normal','high');

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  full_name text not null,
  email text not null unique,
  phone text,
  role user_role not null,
  status profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  meeting_day text,
  meeting_time time,
  location_area text,
  address_optional text,
  capacity integer,
  lifecycle_status group_lifecycle_status not null default 'active',
  health_status group_health_status not null default 'healthy',
  pause_reason text,
  pause_start_date date,
  expected_return_date date,
  restart_reminder_date date,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table group_leaders (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role role_in_group not null,
  assigned_at date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(group_id, profile_id, role)
);

create table members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  household_name text,
  status membership_status not null default 'active',
  care_sensitivity_flag boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  role role_in_group not null default 'member',
  status membership_status not null default 'active',
  joined_at date not null default current_date,
  ended_at date,
  created_at timestamptz not null default now(),
  unique(group_id, member_id)
);

create table attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  meeting_week date not null,
  meeting_date date,
  status attendance_session_status not null default 'not_submitted',
  submitted_by uuid references profiles(id),
  submitted_at timestamptz,
  leader_note text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(group_id, meeting_week)
);

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references attendance_sessions(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  attendance_status attendance_status not null,
  created_at timestamptz not null default now(),
  unique(session_id, member_id)
);

create table guests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  first_attended_group_id uuid references groups(id),
  first_attended_date date,
  pipeline_stage guest_pipeline_stage not null default 'new',
  assigned_group_id uuid references groups(id),
  follow_up_owner_id uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table follow_ups (
  id uuid primary key default gen_random_uuid(),
  type follow_up_type not null,
  title text not null,
  related_group_id uuid references groups(id) on delete set null,
  related_member_id uuid references members(id) on delete set null,
  related_guest_id uuid references guests(id) on delete set null,
  assigned_to uuid references profiles(id) on delete set null,
  priority follow_up_priority not null default 'normal',
  due_date date,
  status follow_up_status not null default 'open',
  leader_visible_note text,
  admin_private_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table group_health_updates (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  submitted_by uuid references profiles(id),
  update_week date not null,
  pulse group_health_status not null,
  follow_up_needed boolean not null default false,
  leader_note text,
  admin_note text,
  created_at timestamptz not null default now(),
  unique(group_id, update_week)
);

create table group_status_history (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  previous_lifecycle_status group_lifecycle_status,
  new_lifecycle_status group_lifecycle_status not null,
  previous_health_status group_health_status,
  new_health_status group_health_status not null,
  reason text,
  changed_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table app_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on profiles for each row execute function set_updated_at();
create trigger groups_set_updated_at before update on groups for each row execute function set_updated_at();
create trigger members_set_updated_at before update on members for each row execute function set_updated_at();
create trigger attendance_sessions_set_updated_at before update on attendance_sessions for each row execute function set_updated_at();
create trigger guests_set_updated_at before update on guests for each row execute function set_updated_at();
create trigger follow_ups_set_updated_at before update on follow_ups for each row execute function set_updated_at();
create trigger app_settings_set_updated_at before update on app_settings for each row execute function set_updated_at();

create index idx_profiles_role on profiles(role);
create index idx_profiles_status on profiles(status);
create index idx_groups_lifecycle on groups(lifecycle_status);
create index idx_groups_health on groups(health_status);
create index idx_group_memberships_group on group_memberships(group_id, status);
create index idx_group_memberships_member on group_memberships(member_id);
create index idx_attendance_sessions_group_week on attendance_sessions(group_id, meeting_week desc);
create index idx_attendance_records_member on attendance_records(member_id);
create index idx_guests_pipeline_stage on guests(pipeline_stage);
create index idx_follow_ups_status_due on follow_ups(status, due_date);
create index idx_group_health_updates_group_week on group_health_updates(group_id, update_week desc);
create index idx_group_status_history_group_created on group_status_history(group_id, created_at desc);
create index idx_audit_events_entity on audit_events(entity_type, entity_id);

comment on table groups is 'Core Life Group records with lifecycle and health tracked separately for operations visibility.';
comment on table attendance_sessions is 'One row per group per week representing submission state and meeting summary.';
comment on table follow_ups is 'Operational tasks assigned to leaders/admin for ministry continuity.';
