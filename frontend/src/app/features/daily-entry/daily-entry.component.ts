import { Component, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Router } from '@angular/router';
import { Member, Month } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { RepositoryService } from '../../core/repository.service';
import { SupabaseWorkflowService } from '../../core/supabase-workflow.service';
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
  openMonth = signal<Month | null>(null);
  members = signal<Member[]>([]);
  amounts = signal<Record<string, number>>({});
  total = () => Object.values(this.amounts()).reduce((sum, amount) => sum + Number(amount || 0), 0);

  constructor(
    private auth: AuthService,
    private repo: RepositoryService,
    private workflow: SupabaseWorkflowService,
    private message: MessageService,
    private router: Router
  ) {
    void this.init();
  }

  async init(): Promise<void> {
    await this.loadOpenMonth();
    await this.load();
    await this.loadEntry();
  }

  async load(): Promise<void> {
    try {
      const result = await this.repo.list<Member>('members', { filters: { status: 'active' }, orderBy: 'name' });
      this.members.set(result.data);
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Failed to load members', detail: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  async loadEntry(): Promise<void> {
    this.amounts.set({});
    this.remarks = '';
    const month = this.openMonth() ?? await this.loadOpenMonth();
    if (!month) return;
    try {
      const data = await this.workflow.dailyEntry<{ remarks?: string | null }>(this.date);
      this.remarks = data.entry?.remarks ?? '';
      const amounts: Record<string, number> = {};
      for (const item of data.items ?? []) {
        if (Number(item.amount) > 0) amounts[item.memberId] = Number(item.amount);
      }
      this.amounts.set(amounts);
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Failed to load entry', detail: err instanceof Error ? err.message : 'Please try again.' });
    }
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
    const month = this.openMonth() ?? await this.loadOpenMonth();
    if (!month) {
      this.notifyNoOpenMonth();
      return;
    }
    if (!this.isDateInMonth(this.dateValue, month)) {
      this.message.add({
        severity: 'warn',
        summary: 'Wrong month selected',
        detail: `Select a date in ${this.monthName(month)} ${month.year}.`
      });
      return;
    }
    try {
      const response = await this.workflow.saveDailyEntry<{ totalCost: number }>(this.date, this.remarks, items.map(([memberId, amount]) => ({ memberId, amount: Number(amount) })));
      const total = Number(response?.totalCost ?? this.total());
      this.message.add({ severity: 'success', summary: 'Entry saved', detail: `Total ${total.toFixed(2)} recorded` });
      await this.loadEntry();
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Failed to save', detail: err instanceof Error ? err.message : 'Unknown error' });
    }
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

  private async loadOpenMonth(): Promise<Month | null> {
    try {
      const month = await this.workflow.openMonth<Month>();
      this.openMonth.set(month);
      return month;
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Failed to load month', detail: err instanceof Error ? err.message : 'Please try again.' });
      this.openMonth.set(null);
      return null;
    }
  }

  private isDateInMonth(date: Date, month: Month): boolean {
    return date.getFullYear() === month.year && date.getMonth() + 1 === month.month;
  }

  private monthName(month: Month): string {
    return new Date(month.year, month.month - 1, 1).toLocaleString('default', { month: 'long' });
  }

  private toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
