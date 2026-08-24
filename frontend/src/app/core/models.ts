export type Role = 'SUPER_ADMIN' | 'TEAM_ADMIN' | 'MEMBER';
export type Status = 'active' | 'archived' | 'inactive';
export type MonthStatus = 'open' | 'locked';
export type TeamStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';

export interface Team { id: string; name: string; email: string; phone?: string; status: TeamStatus; createdAt: string; }

export interface AdminTeamUser { id: string; name: string; email: string; role: Role; teamId: string | null; }

export interface AdminTeam {
  id: string;
  name: string;
  slug: string;
  status: TeamStatus;
  createdAt: string;
  users: AdminTeamUser[];
  _count?: { users: number };
}
export interface User { id: string; teamId: string; email: string; name: string; phone?: string; role: Role; createdAt: string; updatedAt: string; }
export interface Member { id: string; teamId: string; userId?: string; name: string; email: string; phone?: string; status: Status; createdAt: string; }
export interface Snack { id: string; teamId: string; name: string; price: number; status: Status; createdAt: string; }
export interface Month { id: string; teamId: string; year: number; month: number; openingCash: number; closingCash?: number; status: MonthStatus; closedAt?: string; createdAt: string; }
export interface Record { id: string; teamId: string; monthId: string; memberId: string; snackId: string; quantity: number; price: number; amount: number; date: string; createdAt: string; }
export interface Expense { id: string; teamId: string; monthId: string; date: string; item: string; amount: number; remarks?: string; createdAt: string; }
export interface Collection { id: string; teamId: string; memberId: string; monthId: string; amount: number; date: string; remarks?: string; createdAt: string; }
export interface DailyEntry { id: string; teamId: string; monthId: string; entryDate: string; totalCost: number; remarks?: string; createdAt: string; }
export interface EntryItem { id: string; entryId: string; memberId: string; snackId?: string; quantity: number; price: number; amount: number; }
export interface Balance { id: string; teamId: string; memberId: string; monthId: string; openingBalance: number; collection: number; expenseShare: number; closingBalance: number; }
export interface Setting { id: number; teamId: string; companyName: string; logoUrl?: string; currency: string; managerName?: string; updatedAt: string; }
export interface Order { id: string; teamId: string; memberId: string; orderDate: string; orderText: string; createdAt: string; updatedAt: string; }

export interface DashboardStats {
  openingCash: number;
  currentCash: number;
  totalCollection: number;
  totalExpense: number;
  todayCollection: number;
  todayExpense: number;
}
