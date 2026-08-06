import { Component, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
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
  constructor(private repo: RepositoryService, private monthService: MonthService, private dialog: MatDialog, private snack: MatSnackBar, public auth: SupabaseService) { void this.load(); }
  async load(): Promise<void> {
    const { data, error } = await this.auth.client.from('months').select('*').order('year', { ascending: false }).order('month', { ascending: false }).limit(100);
    if (error) throw error;
    this.months.set((data ?? []) as Month[]);
  }
  async createMonth(): Promise<void> {
    const open = await this.auth.getOpenMonth();
    if (open) {
      const ref = this.dialog.open(ConfirmDialogComponent, { data: { title: 'Close Current Month', message: 'Only one month can be open at a time. Close the current month to carry balances forward and open the next one.', action: 'Close & Create' } });
      ref.afterClosed().subscribe(async (ok) => {
        if (!ok) return;
        try { await this.monthService.closeMonth(open.id); this.snack.open('Month closed & next created', 'Close', { duration: 2200, panelClass: ['app-toast'] }); }
        catch (err) { this.snack.open(err instanceof Error ? err.message : 'Failed to close month', 'Close', { duration: 4000, panelClass: ['app-toast'] }); }
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
      this.snack.open('Month already exists', 'Close', { duration: 2200, panelClass: ['app-toast'] });
      return;
    }
    const { error } = await this.auth.client.from('months').insert({ year, month, opening_cash: openingCash, closing_cash: openingCash, status: 'open' });
    if (error) throw error;
    this.snack.open('Month created', 'Close', { duration: 2200, panelClass: ['app-toast'] });
    await this.load();
  }
  async close(row: Month): Promise<void> {
    try { await this.monthService.closeMonth(row.id); this.snack.open('Month closed', 'Dismiss', { duration: 2500 }); }
    catch (err) { this.snack.open(err instanceof Error ? err.message : 'Failed to close month', 'Close', { duration: 4000, panelClass: ['app-toast'] }); }
    await this.load();
  }
  async unlock(row: Month): Promise<void> {
    try { await this.monthService.unlockMonth(row.id); }
    catch (err) { this.snack.open(err instanceof Error ? err.message : 'Failed to unlock month', 'Close', { duration: 4000, panelClass: ['app-toast'] }); }
    await this.load();
  }
  remove(row: Month): void {
    const ref = this.dialog.open(ConfirmDialogComponent, { data: { title: 'Delete Month', message: 'Deletes collections, entries, balances, and reports for this month.', requireText: 'DELETE', action: 'Delete Month' } });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      try { await this.monthService.deleteMonth(row.id); this.snack.open('Month deleted', 'Close', { duration: 2200, panelClass: ['app-toast'] }); }
      catch (err) { this.snack.open(err instanceof Error ? err.message : 'Failed to delete month', 'Close', { duration: 4000, panelClass: ['app-toast'] }); }
      await this.load();
    });
  }
}
