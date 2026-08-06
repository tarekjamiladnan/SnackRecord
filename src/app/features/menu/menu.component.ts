import { Component } from '@angular/core';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { Menu } from '../../core/models';
import { RepositoryService } from '../../core/repository.service';
import { SupabaseService } from '../../core/supabase.service';
import { CrudPageBase } from '../../shared/crud-page.base';
import { EntityDialogComponent } from '../../shared/entity-dialog.component';
import { UI_IMPORTS } from '../../shared/ui';

@Component({
  selector: 'app-menu',
  imports: UI_IMPORTS,
  templateUrl: './menu.component.html',
  styleUrl: '../../shared/page.scss'
})
export class MenuComponent extends CrudPageBase<Menu> {
  title = 'Menu';
  table = 'menus';
  columns = ['name'];
  displayedColumns = ['sl', 'name', 'actions'];
  override searchColumns = ['name'];
  fields = [
    { key: 'name', label: 'Name', required: true }
  ];

  constructor(
    repo: RepositoryService,
    dialog: DialogService,
    message: MessageService,
    auth: SupabaseService
  ) {
    super(repo, dialog, message, auth);
    void this.load();
  }

  override open(row?: Menu): void {
    const ref = this.dialog.open(EntityDialogComponent, {
      header: row ? 'Edit Menu' : 'Add Menu',
      width: '460px',
      data: { title: row ? 'Edit Menu' : 'Add Menu', fields: this.fields, value: row }
    });
    if (!ref) return;
    ref.onClose.subscribe(async (value) => {
      if (!value) return;
      const payload = { ...value, price: 0, status: 'active' };
      row
        ? await this.repo.update<Menu>(this.table, row.id, payload, 'Menu Update')
        : await this.repo.create<Menu>(this.table, payload, 'Menu Add');
      this.message.add({ severity: 'success', summary: 'Saved', detail: 'Menu item saved successfully' });
      await this.load();
    });
  }
}
