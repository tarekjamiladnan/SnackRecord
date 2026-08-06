import { Injectable } from '@angular/core';
import { SupabaseService } from '../../core/supabase.service';

@Injectable({ providedIn: 'root' })
export class MonthService {
  constructor(private supabase: SupabaseService) {}
  async closeMonth(monthId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('close_month', { p_month_id: monthId });
    if (error) throw error;
    await this.supabase.audit('Month Close', 'months', monthId);
  }
  async unlockMonth(monthId: string): Promise<void> {
    const { error } = await this.supabase.client.from('months').update({ status: 'open', closed_at: null }).eq('id', monthId);
    if (error) throw error;
  }
  async deleteMonth(monthId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('delete_month', { p_month_id: monthId });
    if (error) await this.deleteViaRest(monthId);
    await this.auditSafe('Month Delete', monthId);
  }
  private async deleteViaRest(monthId: string): Promise<void> {
    const client = this.supabase.client;
    const { error: openError } = await client.from('months').update({ status: 'open', closed_at: null }).eq('id', monthId);
    if (openError) throw openError;
    const { error: entriesError } = await client.from('daily_entries').delete().eq('month_id', monthId);
    if (entriesError) throw entriesError;
    const { error: expensesError } = await client.from('expenses').delete().eq('month_id', monthId);
    if (expensesError) throw expensesError;
    const { error: collectionsError } = await client.from('collections').delete().eq('month_id', monthId);
    if (collectionsError) throw collectionsError;
    const { error: balancesError } = await client.from('member_month_balances').delete().eq('month_id', monthId);
    if (balancesError) throw balancesError;
    const { error: monthError } = await client.from('months').delete().eq('id', monthId);
    if (monthError) throw monthError;
  }
  private async auditSafe(action: string, monthId: string): Promise<void> {
    try { await this.supabase.audit(action, 'months', monthId); } catch { /* audit is non-critical */ }
  }
}
