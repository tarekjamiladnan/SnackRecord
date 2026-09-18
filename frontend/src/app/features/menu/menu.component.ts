import { Component, computed } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { Snack } from '../../core/models';
import { RepositoryService } from '../../core/repository.service';
import { AuthService } from '../../core/auth.service';
import { OrderDraftService } from '../../core/order-draft.service';
import { CrudPageBase } from '../../shared/crud-page.base';
import { EntityDialogComponent } from '../../shared/entity-dialog.component';
import { UI_IMPORTS } from '../../shared/ui';

@Component({
  selector: 'app-menu',
  imports: UI_IMPORTS,
  templateUrl: './menu.component.html',
  styleUrls: ['../../shared/page.scss', './menu.component.scss']
})
export class MenuComponent extends CrudPageBase<Snack> {
  title = 'Menu';
  table = 'snacks';
  columns = ['name'];
  displayedColumns = ['sl', 'name', 'actions'];
  override searchColumns = ['name'];
  fields = [
    { key: 'name', label: 'Name', required: true }
  ];

  isAdmin = computed(() => this.auth.user()?.role === 'TEAM_ADMIN' || this.auth.user()?.role === 'SUPER_ADMIN');

  constructor(
    repo: RepositoryService,
    dialog: DialogService,
    message: MessageService,
    auth: AuthService,
    private router: Router,
    readonly draft: OrderDraftService
  ) {
    super(repo, dialog, message, auth);
    this.pageSize.set(200);
    void this.load();
  }

  qty = (name: string): number => this.draft.qty(name);

  addToOrder(row: Snack): void {
    const first = this.draft.qty(row.name) === 0;
    this.draft.add(row.name);
    if (first) {
      this.message.add({ severity: 'success', summary: 'Added to order', detail: `${row.name} added to your order.` });
    }
  }

  goToOrder(): void {
    void this.router.navigateByUrl('/order');
  }

  override open(row?: Snack): void {
    const ref = this.dialog.open(EntityDialogComponent, {
      header: row ? 'Edit Menu' : 'Add Menu',
      width: '460px',
      data: { title: row ? 'Edit Menu' : 'Add Menu', fields: this.fields, value: row }
    });
    if (!ref) return;
    ref.onClose.subscribe(async (value) => {
      if (!value) return;
      const payload = { ...value, price: 0, status: 'active' };
      await this.saveMenu(row, payload);
    });
  }

  private async saveMenu(row: Snack | undefined, payload: Record<string, unknown>): Promise<void> {
    try {
      row
        ? await this.repo.update<Snack>(this.table, row.id, payload)
        : await this.repo.create<Snack>(this.table, payload);
      this.message.add({ severity: 'success', summary: 'Saved', detail: 'Menu item saved successfully' });
      await this.load();
    } catch (err) {
      if (this.isDuplicate(err)) {
        this.message.add({
          severity: 'error',
          summary: 'Duplicate item',
          detail: 'A menu item with this name already exists.'
        });
      } else {
        this.message.add({
          severity: 'error',
          summary: 'Save failed',
          detail: err instanceof Error ? err.message : 'Please try again.'
        });
      }
    }
  }

  private isDuplicate(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const code = (err as { code?: string }).code;
    const message = (err as Error)?.message ?? (err as { message?: string }).message ?? String(err);
    return code === '23505' || /duplicate key value violates unique constraint/i.test(message) || /already exists/i.test(message);
  }
}