export type Role = 'admin' | 'user';
export type Status = 'active' | 'archived' | 'inactive';
export type MonthStatus = 'open' | 'locked';

export interface Profile { id: string; email: string; full_name: string | null; role: Role; created_at: string; }
export interface Member { id: string; user_id: string | null; name: string; email: string | null; phone: string | null; status: Status; created_at: string; }
export interface Menu { id: string; name: string; price: number; status: Status; created_at: string; }
export interface Month { id: string; year: number; month: number; opening_cash: number; closing_cash: number; status: MonthStatus; closed_at: string | null; created_at: string; }
export interface Expense { id: string; month_id: string; date: string; item: string; amount: number; remarks: string | null; created_at: string; }
export interface Collection { id: string; member_id: string; month_id: string; amount: number; date: string; remarks: string | null; created_at: string; }
export interface DailyEntry { id: string; month_id: string; entry_date: string; total_cost: number; remarks: string | null; created_at: string; }
export interface EntryItem { id: string; entry_id: string; member_id: string; menu_id: string | null; quantity: number; price: number; amount: number; }
export interface Balance { id: string; member_id: string; month_id: string; opening_balance: number; collection: number; expense_share: number; closing_balance: number; }
export interface Setting { id: number; company_name: string; logo_url: string | null; currency: string; manager_name: string | null; updated_at: string; }
export interface Order { id: string; member_id: string; order_date: string; order_text: string; created_at: string; updated_at: string; }
export interface AuditLog { id: string; actor_id: string | null; action: string; entity: string | null; entity_id: string | null; metadata: Record<string, unknown>; created_at: string; }

export interface DashboardStats {
  openingCash: number;
  currentCash: number;
  totalCollection: number;
  totalExpense: number;
  todayCollection: number;
  todayExpense: number;
}
