import { Directive, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RepositoryService } from '../core/repository.service';
import { SupabaseService } from '../core/supabase.service';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { EntityDialogComponent, FieldConfig } from './entity-dialog.component';

@Directive()
export abstract class CrudPageBase<T extends { id: string }> {
  abstract title: string;
  abstract table: string;
  abstract columns: string[];
  abstract fields: FieldConfig[];
  searchColumns: string[] = [];
  data = signal<T[]>([]);
  count = signal(0);
  page = signal(0);
  pageSize = signal(25);
  search = signal('');
  loading = signal(false);

  protected constructor(protected repo: RepositoryService, protected dialog: MatDialog, protected snack: MatSnackBar, protected auth: SupabaseService) {}

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.repo.list<T>(this.table, { search: this.search(), searchColumns: this.searchColumns, page: this.page(), pageSize: this.pageSize() });
      this.data.set(result.data);
      this.count.set(result.count);
    } finally { this.loading.set(false); }
  }

  open(row?: T): void {
    const ref = this.dialog.open(EntityDialogComponent, { width: '720px', data: { title: row ? `Edit ${this.title}` : `Add ${this.title}`, fields: this.fields, value: row } });
    ref.afterClosed().subscribe(async (value) => {
      if (!value) return;
      row ? await this.repo.update<T>(this.table, row.id, value, `${this.title} Update`) : await this.repo.create<T>(this.table, value, `${this.title} Add`);
      this.snack.open('Saved', 'Dismiss', { duration: 2500 });
      await this.load();
    });
  }

  async delete(row: T, requireText = false): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, { data: { title: `Delete ${this.title}`, message: 'This action cannot be undone.', action: 'Delete', requireText: requireText ? 'DELETE' : undefined } });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      await this.repo.remove(this.table, row.id, `${this.title} Delete`);
      this.snack.open('Deleted', 'Dismiss', { duration: 2500 });
      await this.load();
    });
  }
}
