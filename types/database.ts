import type * as E from './enums';

type UUID = string;
type Timestamp = string;
type DateString = string;

export interface ProfilesRow {
  id: UUID;
  auth_user_id: UUID | null;
  full_name: string;
  email: string;
  phone: string | null;
  role: E.UserRole;
  status: E.ProfileStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface GroupsRow {
  id: UUID;
  name: string;
  description: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  location_area: string | null;
  address_optional: string | null;
  capacity: number | null;
  lifecycle_status: E.GroupLifecycleStatus;
  health_status: E.GroupHealthStatus;
  pause_reason: string | null;
  pause_start_date: DateString | null;
  expected_return_date: DateString | null;
  restart_reminder_date: DateString | null;
  admin_notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  closed_at: Timestamp | null;
}

export interface GroupLeadersRow {
  id: UUID;
  group_id: UUID;
  profile_id: UUID;
  role: E.RoleInGroup;
  assigned_at: DateString;
  active: boolean;
  created_at: Timestamp;
}

export interface MembersRow {
  id: UUID;
  full_name: string;
  email: string | null;
  phone: string | null;
  household_name: string | null;
  status: E.MembershipStatus;
  care_sensitivity_flag: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface GroupMembershipsRow {
  id: UUID;
  group_id: UUID;
  member_id: UUID;
  role: E.RoleInGroup;
  status: E.MembershipStatus;
  joined_at: DateString;
  ended_at: DateString | null;
  created_at: Timestamp;
}

export interface AttendanceSessionsRow {
  id: UUID;
  group_id: UUID;
  meeting_week: DateString;
  meeting_date: DateString | null;
  status: E.AttendanceSessionStatus;
  submitted_by: UUID | null;
  submitted_at: Timestamp | null;
  leader_note: string | null;
  admin_note: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AttendanceRecordsRow {
  id: UUID;
  session_id: UUID;
  member_id: UUID;
  attendance_status: E.AttendanceStatus;
  created_at: Timestamp;
}

export interface GuestsRow {
  id: UUID;
  full_name: string;
  email: string | null;
  phone: string | null;
  first_attended_group_id: UUID | null;
  first_attended_date: DateString | null;
  pipeline_stage: E.GuestPipelineStage;
  assigned_group_id: UUID | null;
  follow_up_owner_id: UUID | null;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface FollowUpsRow {
  id: UUID;
  type: E.FollowUpType;
  title: string;
  related_group_id: UUID | null;
  related_member_id: UUID | null;
  related_guest_id: UUID | null;
  assigned_to: UUID | null;
  priority: E.FollowUpPriority;
  due_date: DateString | null;
  status: E.FollowUpStatus;
  leader_visible_note: string | null;
  admin_private_note: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  completed_at: Timestamp | null;
}

export interface GroupHealthUpdatesRow {
  id: UUID;
  group_id: UUID;
  submitted_by: UUID | null;
  update_week: DateString;
  pulse: E.GroupHealthStatus;
  follow_up_needed: boolean;
  leader_note: string | null;
  admin_note: string | null;
  created_at: Timestamp;
}

export interface AuditEventsRow {
  id: UUID;
  actor_profile_id: UUID | null;
  action: string;
  entity_type: string;
  entity_id: UUID | null;
  metadata: Record<string, unknown>;
  created_at: Timestamp;
}

type InsertOf<Row, Auto extends keyof Row, Optional extends keyof Row = never> =
  Omit<Row, Auto | Optional> & Partial<Pick<Row, Auto | Optional>>;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfilesRow;
        Insert: InsertOf<ProfilesRow, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<ProfilesRow>;
        Relationships: [];
      };
      groups: {
        Row: GroupsRow;
        Insert: InsertOf<GroupsRow, 'id' | 'created_at' | 'updated_at' | 'closed_at'>;
        Update: Partial<GroupsRow>;
        Relationships: [];
      };
      group_leaders: {
        Row: GroupLeadersRow;
        Insert: InsertOf<GroupLeadersRow, 'id' | 'created_at' | 'assigned_at' | 'active'>;
        Update: Partial<GroupLeadersRow>;
        Relationships: [];
      };
      members: {
        Row: MembersRow;
        Insert: InsertOf<MembersRow, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<MembersRow>;
        Relationships: [];
      };
      group_memberships: {
        Row: GroupMembershipsRow;
        Insert: InsertOf<GroupMembershipsRow, 'id' | 'created_at' | 'joined_at' | 'ended_at'>;
        Update: Partial<GroupMembershipsRow>;
        Relationships: [];
      };
      attendance_sessions: {
        Row: AttendanceSessionsRow;
        Insert: InsertOf<AttendanceSessionsRow, 'id' | 'created_at' | 'updated_at' | 'submitted_by' | 'submitted_at'>;
        Update: Partial<AttendanceSessionsRow>;
        Relationships: [];
      };
      attendance_records: {
        Row: AttendanceRecordsRow;
        Insert: InsertOf<AttendanceRecordsRow, 'id' | 'created_at'>;
        Update: Partial<AttendanceRecordsRow>;
        Relationships: [];
      };
      guests: {
        Row: GuestsRow;
        Insert: InsertOf<GuestsRow, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<GuestsRow>;
        Relationships: [];
      };
      follow_ups: {
        Row: FollowUpsRow;
        Insert: InsertOf<FollowUpsRow, 'id' | 'created_at' | 'updated_at' | 'completed_at'>;
        Update: Partial<FollowUpsRow>;
        Relationships: [];
      };
      group_health_updates: {
        Row: GroupHealthUpdatesRow;
        Insert: InsertOf<GroupHealthUpdatesRow, 'id' | 'created_at'>;
        Update: Partial<GroupHealthUpdatesRow>;
        Relationships: [];
      };
      audit_events: {
        Row: AuditEventsRow;
        Insert: InsertOf<AuditEventsRow, 'id' | 'created_at' | 'metadata'>;
        Update: Partial<AuditEventsRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_create_leader_profile: {
        Args: { p_full_name: string; p_email: string; p_phone: string | null };
        Returns: UUID;
      };
      admin_create_member: {
        Args: { p_full_name: string; p_email: string | null; p_phone: string | null };
        Returns: UUID;
      };
      admin_assign_leader_to_group: {
        Args: { p_group_id: UUID; p_profile_id: UUID; p_role: E.RoleInGroup };
        Returns: UUID;
      };
      admin_assign_member_to_group: {
        Args: { p_group_id: UUID; p_member_id: UUID };
        Returns: UUID;
      };
      admin_deactivate_profile: {
        Args: { p_profile_id: UUID };
        Returns: UUID;
      };
      admin_deactivate_member: {
        Args: { p_member_id: UUID };
        Returns: UUID;
      };
      admin_create_group: {
        Args: {
          p_name: string;
          p_description: string | null;
          p_meeting_day: string | null;
          p_meeting_time: string | null;
          p_location_area: string | null;
          p_address_optional: string | null;
          p_capacity: number | null;
        };
        Returns: UUID;
      };
      admin_update_group: {
        Args: {
          p_group_id: UUID;
          p_name: string;
          p_description: string | null;
          p_meeting_day: string | null;
          p_meeting_time: string | null;
          p_location_area: string | null;
          p_address_optional: string | null;
          p_capacity: number | null;
        };
        Returns: UUID;
      };
      admin_close_group: {
        Args: { p_group_id: UUID };
        Returns: UUID;
      };
      admin_reopen_group: {
        Args: { p_group_id: UUID };
        Returns: UUID;
      };
      leader_submit_group_checkin: {
        Args: {
          p_group_id: UUID;
          p_meeting_week: DateString;
          p_meeting_date: DateString | null;
          p_status: 'submitted' | 'did_not_meet' | 'planned_pause';
          p_leader_note: string | null;
          p_pulse: 'healthy' | 'watch' | 'needs_follow_up' | null;
          p_follow_up_needed: boolean;
          p_attendance: { member_id: UUID; attendance_status: E.AttendanceStatus }[];
        };
        Returns: UUID;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export interface GroupDashboardSummaryDTO {
  group_id: UUID;
  name: string;
  lifecycle_status: E.GroupLifecycleStatus;
  health_status: E.GroupHealthStatus;
  active_members: number;
  latest_meeting_week: DateString | null;
}
