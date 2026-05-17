import type * as E from './enums';

type UUID = string;
type Timestamp = string;
type DateString = string;

export interface ProfilesRow { id: UUID; auth_user_id: UUID | null; full_name: string; email: string; phone: string | null; role: E.UserRole; status: E.ProfileStatus; created_at: Timestamp; updated_at: Timestamp; }
export interface GroupsRow { id: UUID; name: string; description: string | null; meeting_day: string | null; meeting_time: string | null; location_area: string | null; address_optional: string | null; capacity: number | null; lifecycle_status: E.GroupLifecycleStatus; health_status: E.GroupHealthStatus; pause_reason: string | null; pause_start_date: DateString | null; expected_return_date: DateString | null; restart_reminder_date: DateString | null; admin_notes: string | null; created_at: Timestamp; updated_at: Timestamp; closed_at: Timestamp | null; }
export interface MembersRow { id: UUID; full_name: string; email: string | null; phone: string | null; household_name: string | null; status: E.MembershipStatus; care_sensitivity_flag: boolean; created_at: Timestamp; updated_at: Timestamp; }

export interface Database {
  public: {
    Tables: {
      profiles: { Row: ProfilesRow; Insert: Omit<ProfilesRow, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<ProfilesRow, 'id'>> };
      groups: { Row: GroupsRow; Insert: Omit<GroupsRow, 'id' | 'created_at' | 'updated_at' | 'closed_at'> & Partial<Pick<GroupsRow, 'id' | 'closed_at'>> };
      members: { Row: MembersRow; Insert: Omit<MembersRow, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<MembersRow, 'id'>> };
    };
  };
}

export interface GroupDashboardSummaryDTO { group_id: UUID; name: string; lifecycle_status: E.GroupLifecycleStatus; health_status: E.GroupHealthStatus; active_members: number; latest_meeting_week: DateString | null; }
