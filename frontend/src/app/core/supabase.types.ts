export type AppRole = 'SUPER_ADMIN' | 'TEAM_ADMIN' | 'MEMBER';
export type TeamStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED' | 'DELETED';

export interface Team {
  id: string;
  name: string;
  slug: string;
  status: TeamStatus;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  team_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: AppRole;
}

export interface UserContext extends Profile {
  team: { id: string; name: string; status: TeamStatus } | null;
}

export interface Member {
  id: string;
  team_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'archived';
  created_at: string;
}