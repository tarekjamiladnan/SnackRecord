import { Component, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Router } from '@angular/router';
import { Member } from '../../core/models';
import { SupabaseService } from '../../core/supabase.service';
import { UI_IMPORTS } from '../../shared/ui';

@Component({
  selector: 'app-collections',
  imports: UI_IMPORTS,
  templateUrl: './collections.component.html',
  styleUrl: '../../shared/page.scss'
})
export class CollectionsComponent {
  members = signal<Member[]>([]);
  collections = signal<any[]>([]);
  columns = ['member', 'amount', 'date'];
  memberId = '';
  amount: number | null = null;
  date = new Date().toISOString().slice(0, 10);
  dateValue = new Date();

  constructor(
    private supabase: SupabaseService,
    private message: MessageService,
    private router: Router
  ) {
    void this.load();
  }

  async load(): Promise<void> {
    const [{ data: members }, { data: collections }] = await Promise.all([
      this.supabase.client.from('members').select('*').eq('status', 'active').order('name'),
      this.supabase.client.from('collections').select('*, members(name)').order('date', { ascending: false }).limit(50)
    ]);
    this.members.set((members ?? []) as Member[]);
    this.collections.set(collections ?? []);
  }

  async save(): Promise<void> {
    if (!this.memberId || !this.amount) return;
    const month = await this.supabase.getOpenMonth();
    if (!month) {
      this.notifyNoOpenMonth();
      return;
    }
    const { error } = await this.supabase.client.from('collections').insert({
      member_id: this.memberId,
      month_id: month.id,
      amount: Number(this.amount),
      date: this.date,
      remarks: null
    });
    if (error) throw error;
    this.amount = null;
    this.message.add({ severity: 'success', summary: 'Collection saved', detail: 'Money received and recorded' });
    await this.load();
  }

  setDate(value: Date | string | null): void {
    if (!value) return;
    const date = value instanceof Date ? value : new Date(value);
    this.dateValue = date;
    this.date = this.toIsoDate(date);
  }

  visibleTotal(): number {
    return this.collections().reduce((total, row) => total + Number(row.amount ?? 0), 0);
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
      detail: 'Create a new month before saving collections.',
      sticky: true
    });
  }

  private toIsoDate(date: Date): string {
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 10);
  }
}
