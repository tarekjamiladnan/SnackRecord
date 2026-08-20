import { Directive, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { RepositoryService } from '../core/repository.service';
import { AuthService } from '../core/auth.service';
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

  protected constructor(
    protected repo: RepositoryService,
    protected dialog: DialogService,
    protected message: MessageService,
    protected auth: AuthService
  ) {}

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.repo.list<T>(this.table, {
        search: this.search(),
        searchColumns: this.searchColumns,
        page: this.page(),
        pageSize: this.pageSize()
      });
      this.data.set(result.data);
      this.count.set(result.total);
    } finally {
      this.loading.set(false);
    }
  }

  onPage(event: { first: number; rows: number }): void {
    this.page.set(Math.floor(event.first / event.rows));
    this.pageSize.set(event.rows);
    void this.load();
  }

  open(row?: T): void {
    const ref = this.dialog.open(EntityDialogComponent, {
      header: row ? `Edit ${this.title}` : `Add ${this.title}`,
      width: '520px',
      data: {
        title: row ? `Edit ${this.title}` : `Add ${this.title}`,
        fields: this.fields,
        value: row
      }
    });
    if (!ref) return;
    ref.onClose.subscribe(async (value) => {
      if (!value) return;
      row
        ? await this.repo.update<T>(this.table, row.id, value)
        : await this.repo.create<T>(this.table, value);
      this.message.add({ severity: 'success', summary: 'Saved', detail: `${this.title} saved successfully` });
      await this.load();
    });
  }

  delete(row: T, requireText = false): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      header: `Delete ${this.title}`,
      width: '460px',
      data: {
        title: `Delete ${this.title}`,
        message: 'This action cannot be undone.',
        action: 'Delete',
        requireText: requireText ? 'DELETE' : undefined
      }
    });
    if (!ref) return;
    ref.onClose.subscribe(async (ok) => {
      if (!ok) return;
      await this.repo.remove(this.table, row.id);
      this.message.add({ severity: 'success', summary: 'Deleted', detail: `${this.title} deleted` });
      await this.load();
    });
  }
}
