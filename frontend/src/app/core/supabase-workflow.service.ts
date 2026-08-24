import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

const camel = <T>(row: any): T => {
  if (!row || typeof row !== 'object') return row as T;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value
  ])) as T;
};

@Injectable({ providedIn: 'root' })
export class SupabaseWorkflowService {
  constructor(private supabase: SupabaseService) {}

  async openMonth<T>(): Promise<T | null> {
    const { data, error } = await this.supabase.from('months').select('*').eq('status', 'open').maybeSingle();
    if (error) throw error;
    return camel<T>(data);
  }

  async dailyEntry<T>(date: string): Promise<{ entry: T | null; items: any[] }> {
    const { data: entry, error: entryError } = await this.supabase.from('daily_entries').select('*').eq('entry_date', date).maybeSingle();
    if (entryError) throw entryError;
    if (!entry) return { entry: null, items: [] };
    const { data: items, error: itemError } = await this.supabase.from('entry_items').select('*').eq('entry_id', entry.id);
    if (itemError) throw itemError;
    return { entry: camel<T>(entry), items: (items ?? []).map(camel) };
  }

  async saveDailyEntry<T>(date: string, remarks: string, items: { memberId: string; amount: number }[]): Promise<T> {
    const { data, error } = await this.supabase.rpc('save_daily_entry', {
      p_entry_date: date,
      p_remarks: remarks,
      p_items: items.map((item) => ({ member_id: item.memberId, amount: item.amount }))
    });
    if (error) throw error;
    return camel<T>(data);
  }

  async closeMonth<T>(id: string): Promise<T> {
    const { data, error } = await this.supabase.rpc('close_month', { p_month_id: id });
    if (error) throw error;
    return camel<T>(data);
  }

  async unlockMonth<T>(id: string): Promise<T> {
    const { data, error } = await this.supabase.from('months').update({ status: 'open', closed_at: null }).eq('id', id).select().single();
    if (error) throw error;
    return camel<T>(data);
  }

  async deleteMonth(id: string): Promise<void> {
    const { error } = await this.supabase.from('months').delete().eq('id', id);
    if (error) throw error;
  }

  async dashboard(): Promise<{ members: any[]; entries: any[] }> {
    const [{ data: members, error: membersError }, { data: entries, error: entriesError }] = await Promise.all([
      this.supabase.from('members').select('*').eq('status', 'active').order('name'),
      this.supabase.from('daily_entries').select('*, entry_items(amount, members(name))').order('entry_date', { ascending: false }).limit(10)
    ]);
    if (membersError) throw membersError;
    if (entriesError) throw entriesError;
    const memberRows = await Promise.all((members ?? []).map(async (member: any) => {
      const [{ data: collections }, { data: used }] = await Promise.all([
        this.supabase.from('collections').select('amount').eq('member_id', member.id),
        this.supabase.from('entry_items').select('amount').eq('member_id', member.id)
      ]);
      const given = (collections ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
      const consumed = (used ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
      return { id: member.id, userId: member.user_id, email: member.email, name: member.name, given, used: consumed, left: given - consumed };
    }));
    return {
      members: memberRows,
      entries: (entries ?? []).map((entry: any) => ({
        id: entry.id,
        date: entry.entry_date,
        remarks: entry.remarks,
        total: Number(entry.total_cost),
        items: (entry.entry_items ?? []).map((item: any) => ({ name: item.members?.name ?? 'Unknown member', amount: Number(item.amount) }))
      }))
    };
  }

  async monthlyReport(year: number, month: number): Promise<any[]> {
    const { data: monthRow, error: monthError } = await this.supabase.from('months').select('*').eq('year', year).eq('month', month).maybeSingle();
    if (monthError) throw monthError;
    const { data: members, error: memberError } = await this.supabase.from('members').select('*').eq('status', 'active').order('name');
    if (memberError) throw memberError;
    if (!monthRow) return (members ?? []).map((member: any) => ({ person: member.name, opening: 0, given: 0, used: 0, left: 0 }));
    return Promise.all((members ?? []).map(async (member: any) => {
      const [{ data: collections }, { data: entries }] = await Promise.all([
        this.supabase.from('collections').select('amount').eq('member_id', member.id).eq('month_id', monthRow.id),
        this.supabase.from('entry_items').select('amount, daily_entries!inner(month_id)').eq('member_id', member.id).eq('daily_entries.month_id', monthRow.id)
      ]);
      const given = (collections ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
      const used = (entries ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
      const opening = 0;
      return { person: member.name, opening, given, used, left: opening + given - used };
    }));
  }

  async memberInfo(date: string): Promise<any> {
    const context = await this.supabase.userContext();
    const [{ data: member }, { data: settings }] = await Promise.all([
      this.supabase.from('members').select('*').eq('user_id', context?.id ?? '').maybeSingle(),
      this.supabase.from('team_settings').select('*').maybeSingle()
    ]);
    const [{ data: order }, { data: request }] = member ? await Promise.all([
      this.supabase.from('orders').select('*').eq('member_id', member.id).eq('order_date', date).maybeSingle(),
      this.supabase.from('order_requests').select('*').eq('member_id', member.id).eq('request_date', date).maybeSingle()
    ]) : [{ data: null }, { data: null }];
    return { member: camel(member), settings: camel(settings), order: camel(order), request: camel(request) };
  }

  async submitOrder<T>(date: string, text: string): Promise<T> {
    const { data, error } = await this.supabase.rpc('submit_order', { p_order_date: date, p_order_text: text });
    if (error) throw error;
    return camel<T>(data);
  }

  async memberBalance(memberId: string): Promise<number> {
    const { data: month, error: monthError } = await this.supabase.from('months').select('id, opening_cash').eq('status', 'open').maybeSingle();
    if (monthError) throw monthError;
    if (!month) return 0;
    const [{ data: collections, error: collectionError }, { data: used, error: usedError }] = await Promise.all([
      this.supabase.from('collections').select('amount').eq('member_id', memberId).eq('month_id', month.id),
      this.supabase.from('entry_items').select('amount, daily_entries!inner(month_id)').eq('member_id', memberId).eq('daily_entries.month_id', month.id)
    ]);
    if (collectionError) throw collectionError;
    if (usedError) throw usedError;
    return Number(month.opening_cash ?? 0) + (collections ?? []).reduce((sum, row) => sum + Number(row.amount), 0) - (used ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  }

  async requestLateOrder<T>(date: string): Promise<T> {
    const { data, error } = await this.supabase.rpc('request_order_permission', { p_request_date: date });
    if (error) throw error;
    return camel<T>(data);
  }

  async adminOrders(date: string, search = ''): Promise<any[]> {
    const { data, error } = await this.supabase.from('orders').select('*, members(id,name,email)').eq('order_date', date).order('created_at', { ascending: false });
    if (error) throw error;
    const rows = (data ?? []).map((row: any) => ({ ...camel<any>(row), member: camel<any>(row.members) }));
    return search ? rows.filter((row) => row.member?.name?.toLowerCase().includes(search.toLowerCase())) : rows;
  }

  async orderRequests(date: string): Promise<any[]> {
    const { data, error } = await this.supabase.from('order_requests').select('*, members(id,name,email)').eq('request_date', date).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ ...camel<any>(row), member: camel<any>(row.members) }));
  }

  async updateOrder<T>(id: string, text: string): Promise<T> {
    const { data, error } = await this.supabase.from('orders').update({ order_text: text }).eq('id', id).select().single();
    if (error) throw error;
    return camel<T>(data);
  }

  async deleteOrder(id: string): Promise<void> {
    const { error } = await this.supabase.from('orders').delete().eq('id', id);
    if (error) throw error;
  }

  async updateOrderRequest<T>(id: string, status: 'approved' | 'rejected'): Promise<T> {
    const { data, error } = await this.supabase.from('order_requests').update({ status }).eq('id', id).select().single();
    if (error) throw error;
    return camel<T>(data);
  }

  async team(): Promise<any> {
    const context = await this.supabase.userContext();
    return context?.team ?? null;
  }

  async adminTeams(): Promise<any[]> {
    const { data, error } = await this.supabase.from('teams').select('*, profiles(*)').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((team: any) => ({ ...camel(team), users: (team.profiles ?? []).map(camel) }));
  }

  async updateTeamStatus<T>(id: string, status: string): Promise<T> {
    const { data, error } = await this.supabase.from('teams').update({ status }).eq('id', id).select().single();
    if (error) throw error;
    return camel<T>(data);
  }

  async deleteTeam(id: string): Promise<void> {
    const { error } = await this.supabase.from('teams').delete().eq('id', id);
    if (error) throw error;
  }
}