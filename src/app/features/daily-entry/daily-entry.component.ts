import { Component, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Router } from '@angular/router';
import { Member } from '../../core/models';
import { SupabaseService } from '../../core/supabase.service';
import { UI_IMPORTS } from '../../shared/ui';

@Component({
  selector: 'app-daily-entry',
  imports: UI_IMPORTS,
  templateUrl: './daily-entry.component.html',
  styleUrls: ['../../shared/page.scss', './daily-entry.component.scss']
})
export class DailyEntryComponent {
  date = new Date().toISOString().slice(0, 10);
  dateValue = new Date();
  remarks = '';
  members = signal<Member[]>([]);
  amounts = signal<Record<string, number>>({});
  total = () => Object.values(this.amounts()).reduce((sum, amount) => sum + Number(amount || 0), 0);

  constructor(
    private supabase: SupabaseService,
    private message: MessageService,
    private router: Router
  ) {
    void this.load();
    void this.loadEntry();
  }

  async load(): Promise<void> {
    const { data } = await this.supabase.client.from('members').select('*').eq('status', 'active').order('name');
    this.members.set((data ?? []) as Member[]);
  }

  async loadEntry(): Promise<void> {
    this.amounts.set({});
    this.remarks = '';
    const month = await this.supabase.getOpenMonth();
    if (!month) return;
    const { data: entry } = await this.supabase.client
      .from('daily_entries')
      .select('id,remarks,entry_items(member_id,amount)')
      .eq('month_id', month.id)
      .eq('entry_date', this.date)
      .maybeSingle();
    if (!entry) return;
    this.remarks = entry.remarks ?? '';
    const values: Record<string, number> = {};
    for (const item of entry.entry_items ?? []) values[item.member_id] = (values[item.member_id] ?? 0) + Number(item.amount);
    this.amounts.set(values);
  }

  setAmount(memberId: string, value: number | string): void {
    const amount = Math.max(0, Number(value) || 0);
    this.amounts.update((current) => ({ ...current, [memberId]: amount }));
  }

  setDate(value: Date | string | null): void {
    if (!value) return;
    const date = value instanceof Date ? value : new Date(value);
    this.dateValue = date;
    this.date = this.toIsoDate(date);
    void this.loadEntry();
  }

  async save(): Promise<void> {
    const items = Object.entries(this.amounts()).filter(([, amount]) => Number(amount) > 0);
    if (!items.length) return;
    const month = await this.supabase.getOpenMonth();
    if (!month) {
      this.notifyNoOpenMonth();
      return;
    }
    const { data: existing, error: existingError } = await this.supabase.client.from('daily_entries').select('id').eq('month_id', month.id).eq('entry_date', this.date).maybeSingle();
    if (existingError) throw existingError;
    const remark = this.remarks.trim() || null;
    const entryResult = existing
      ? await this.supabase.client.from('daily_entries').update({ total_cost: this.total(), remarks: remark }).eq('id', existing.id).select().single()
      : await this.supabase.client.from('daily_entries').insert({ month_id: month.id, entry_date: this.date, total_cost: this.total(), remarks: remark }).select().single();
    const { data: entry, error } = entryResult;
    if (error) throw error;
    if (existing) {
      const { error: deleteError } = await this.supabase.client.from('entry_items').delete().eq('entry_id', entry.id);
      if (deleteError) throw deleteError;
    }
    await this.supabase.client.from('entry_items').insert(items.map(([memberId, amount]) => ({ entry_id: entry.id, member_id: memberId, menu_id: null, quantity: 1, price: 0, amount })));
    await this.supabase.audit(existing ? 'Daily Entry Update' : 'Daily Entry Add', 'daily_entries', entry.id);
    this.amounts.set({});
    this.remarks = '';
    this.message.add({ severity: 'success', summary: existing ? 'Entry updated' : 'Entry saved', detail: `Total ${this.total().toFixed(2)} recorded` });
  }

  initials(name?: string): string {
    return (name ?? '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  private notifyNoOpenMonth(): void {
    this.message.add({
      key: 'no-month',
      severity: 'warn',
      summary: 'No open month',
      detail: 'Create a new month before saving daily entries.',
      sticky: true
    });
  }

  private toIsoDate(date: Date): string {
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 10);
  }
}
