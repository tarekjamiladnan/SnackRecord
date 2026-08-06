import { Component, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { Month } from '../../core/models';
import { RepositoryService } from '../../core/repository.service';
import { SupabaseService } from '../../core/supabase.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import { UI_IMPORTS } from '../../shared/ui';
import { MonthService } from './month.service';

@Component({
  selector: 'app-months',
  imports: UI_IMPORTS,
  templateUrl: './months.component.html',
  styleUrl: '../../shared/page.scss'
})
export class MonthsComponent {
  months = signal<Month[]>([]);
  columns = ['year', 'month', 'opening_cash', 'closing_cash', 'status'];
  displayedColumns = [...this.columns, 'actions'];

  constructor(
    private repo: RepositoryService,
    private monthService: MonthService,
    private dialog: DialogService,
    private message: MessageService,
    public auth: SupabaseService
  ) {
    void this.load();
  }

  async load(): Promise<void> {
    const { data, error } = await this.auth.client.from('months').select('*').order('year', { ascending: false }).order('month', { ascending: false }).limit(100);
    if (error) throw error;
    this.months.set((data ?? []) as Month[]);
  }

  monthName(month: number): string {
    return new Date(2000, month - 1, 1).toLocaleString('default', { month: 'long' });
  }

  async createMonth(): Promise<void> {
    const open = await this.auth.getOpenMonth();
    if (open) {
      const ref = this.dialog.open(ConfirmDialogComponent, {
        header: 'Close Current Month',
        width: '480px',
        data: {
          title: 'Close Current Month',
          message: 'Only one month can be open at a time. Close the current month to carry balances forward and open the next one.',
          action: 'Close & Create'
        }
      });
      if (!ref) return;
      ref.onClose.subscribe(async (ok) => {
        if (!ok) return;
        try {
          await this.monthService.closeMonth(open.id);
          this.message.add({ severity: 'success', summary: 'Month closed', detail: 'Month closed & next created' });
        } catch (err) {
          this.message.add({ severity: 'error', summary: 'Failed to close month', detail: err instanceof Error ? err.message : 'Unknown error' });
        }
        await this.load();
      });
      return;
    }
    const latest = this.months()[0];
    const baseDate = latest ? new Date(latest.year, latest.month - 1, 1) : new Date();
    const nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + (latest ? 1 : 0), 1);
    const year = nextDate.getFullYear();
    const month = nextDate.getMonth() + 1;
    const openingCash = Number(latest?.closing_cash ?? 0);
    const existing = this.months().find((row) => row.year === year && row.month === month);
    if (existing) {
      this.message.add({ severity: 'warn', summary: 'Month already exists', detail: `${this.monthName(month)} ${year} already exists` });
      return;
    }
    const { error } = await this.auth.client.from('months').insert({ year, month, opening_cash: openingCash, closing_cash: openingCash, status: 'open' });
    if (error) throw error;
    this.message.add({ severity: 'success', summary: 'Month created', detail: `${this.monthName(month)} ${year} is now open` });
    await this.load();
  }

  async close(row: Month): Promise<void> {
    try {
      await this.monthService.closeMonth(row.id);
      this.message.add({ severity: 'success', summary: 'Month closed', detail: `${this.monthName(row.month)} ${row.year} closed` });
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Failed to close month', detail: err instanceof Error ? err.message : 'Unknown error' });
    }
    await this.load();
  }

  async unlock(row: Month): Promise<void> {
    try {
      await this.monthService.unlockMonth(row.id);
      this.message.add({ severity: 'success', summary: 'Month unlocked', detail: `${this.monthName(row.month)} ${row.year} is open again` });
    } catch (err) {
      this.message.add({ severity: 'error', summary: 'Failed to unlock month', detail: err instanceof Error ? err.message : 'Unknown error' });
    }
    await this.load();
  }

  remove(row: Month): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      header: 'Delete Month',
      width: '480px',
      data: {
        title: 'Delete Month',
        message: 'Deletes collections, entries, balances, and reports for this month.',
        requireText: 'DELETE',
        action: 'Delete Month'
      }
    });
    if (!ref) return;
    ref.onClose.subscribe(async (ok) => {
      if (!ok) return;
      try {
        await this.monthService.deleteMonth(row.id);
        this.message.add({ severity: 'success', summary: 'Month deleted', detail: `${this.monthName(row.month)} ${row.year} deleted` });
      } catch (err) {
        this.message.add({ severity: 'error', summary: 'Failed to delete month', detail: err instanceof Error ? err.message : 'Unknown error' });
      }
      await this.load();
    });
  }
}
